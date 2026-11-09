import * as mat4 from './renderers/geometry/mat4.js';

/**
 * Plays a model's animation clips and poses its skeleton.
 *
 * One per animated entity. It owns a copy of the model's node transforms,
 * blends every playing clip into them by weight, walks the tree for world
 * matrices, and multiplies each skin's joints by their inverse bind
 * matrices into the joint array the renderer skins with. `play` crossfades:
 * what was playing fades out over `fade` seconds as the new clip fades in,
 * so a walk becomes a run without a snap.
 *
 * Presentation only: it advances on the frame's delta, never on the
 * simulation tick, and nothing in the simulation reads a pose.
 */
export class Animator3D {
  /** @param {import('./gltf.js').Model} model */
  constructor(model) {
    this.model = model;
    this.clips = new Map(model.animations.map((clip) => [clip.name, clip]));
    const n = model.nodes.length;
    this.translation = new Float32Array(n * 3);
    this.rotation = new Float32Array(n * 4);
    this.scale = new Float32Array(n * 3);
    this.#reset();
    this.local = new Float32Array(n * 16);
    this.world = new Float32Array(n * 16);
    /** @type {Float32Array[]} Joint matrices per skin, in model space. */
    this.joints = model.skins.map((skin) => new Float32Array(skin.joints.length * 16));
    /**
     * Last frame's joint matrices, kept so a skinned mesh can report the
     * motion of its own limbs and not just of the body carrying them.
     * The renderer reads these for the previous clip position, which is
     * what motion blur and the temporal filter reproject along.
     * @type {Float32Array[]}
     */
    this.previousJoints = model.skins.map((skin) => new Float32Array(skin.joints.length * 16));
    this.posed = false;
    /** @type {Array<{clip: object, time: number, weight: number, target: number, rate: number, speed: number, loop: boolean}>} */
    this.layers = [];
    // Order nodes parents-first once, so a flat loop computes the world
    // matrices however the file ordered its nodes.
    this.order = [];
    const visit = (index) => { this.order.push(index); for (const child of model.nodes[index].children) visit(child); };
    for (const root of model.roots) visit(root);
    this.#pose();
  }

  #reset() {
    this.model.nodes.forEach((node, i) => {
      this.translation.set(node.translation, i * 3);
      this.rotation.set(node.rotation, i * 4);
      this.scale.set(node.scale, i * 3);
    });
  }

  /** The clip names this model offers. */
  get clipNames() {
    return [...this.clips.keys()];
  }

  /** The clip currently fading in or holding, by name, or null. */
  get current() {
    const top = this.layers[this.layers.length - 1];
    return top && top.target > 0 ? top.clip.name : null;
  }

  /**
   * Play a clip, crossfading from whatever is playing.
   * @param {string} name
   * @param {object} [options]
   * @param {number} [options.fade=0.2] - Seconds to blend in and the others out
   * @param {boolean} [options.loop=true]
   * @param {number} [options.speed=1]
   * @param {boolean} [options.restart=false] - Start over even if already playing
   * @returns {boolean} Whether the clip exists
   */
  play(name, { fade = 0.2, loop = true, speed = 1, restart = false } = {}) {
    const clip = this.clips.get(name);
    if (!clip) return false;
    const top = this.layers[this.layers.length - 1];
    if (top && top.clip === clip && top.target > 0 && !restart) {
      top.loop = loop;
      top.speed = speed;
      return true;
    }
    const rate = fade > 0 ? 1 / fade : Infinity;
    for (const layer of this.layers) { layer.target = 0; layer.rate = rate; }
    this.layers.push({ clip, time: 0, weight: fade > 0 ? 0 : 1, target: 1, rate, speed, loop });
    // A snap is a discontinuity, not motion: the pose it lands on was
    // never on screen to move from, so the next one is its own previous
    // and the frame reports no velocity. A crossfade is real movement
    // and keeps its.
    if (fade <= 0) this.posed = false;
    return true;
  }

  /** Stop everything, back to the bind pose. */
  stop() {
    this.layers = [];
    this.#reset();
    // As with a snap: the bind pose is a jump, not movement.
    this.posed = false;
    this.#pose();
  }

  /**
   * Advance by `dt` seconds and recompute the pose.
   * @param {number} dt
   */
  update(dt) {
    if (!this.layers.length) return;
    for (const layer of this.layers) {
      layer.time += dt * layer.speed;
      const duration = layer.clip.duration || 1e-6;
      if (layer.loop) layer.time %= duration;
      else layer.time = Math.min(layer.time, duration);
      const step = layer.rate === Infinity ? 1 : layer.rate * dt;
      layer.weight += Math.sign(layer.target - layer.weight) * Math.min(step, Math.abs(layer.target - layer.weight));
    }
    this.layers = this.layers.filter((layer) => layer.weight > 0 || layer.target > 0);
    this.#blend();
    this.#pose();
  }

  /** Blend every layer's sampled channels into the node transforms. */
  #blend() {
    this.#reset();
    const total = this.layers.reduce((sum, layer) => sum + layer.weight, 0);
    if (total <= 0) return;
    // Which nodes a clip drives: the rest keep the bind pose. Weights are
    // normalised per node over the layers that touch it, so a fading clip
    // never dims a node into its bind pose on the way out.
    const touched = new Map();
    for (const layer of this.layers) {
      for (const channel of layer.clip.channels) {
        const key = channel.node * 4 + (channel.path === 'translation' ? 0 : channel.path === 'rotation' ? 1 : 2);
        touched.set(key, (touched.get(key) ?? 0) + layer.weight);
      }
    }
    const written = new Set();
    for (const layer of this.layers) {
      if (layer.weight <= 0) continue;
      for (const channel of layer.clip.channels) {
        const key = channel.node * 4 + (channel.path === 'translation' ? 0 : channel.path === 'rotation' ? 1 : 2);
        const w = layer.weight / touched.get(key);
        const first = !written.has(key);
        written.add(key);
        this.#apply(channel, layer.time, w, first);
      }
    }
  }

  #apply(channel, time, w, first) {
    const { times, values, stride, node } = channel;
    const count = times.length;
    let i = 0;
    while (i < count - 1 && times[i + 1] <= time) i++;
    const j = Math.min(i + 1, count - 1);
    const span = times[j] - times[i];
    const t = channel.step || span <= 0 ? 0 : Math.min(1, Math.max(0, (time - times[i]) / span));
    const a = i * stride;
    const b = j * stride;
    if (channel.path === 'rotation') {
      // Shortest-arc interpolation between keys, then a normalised blend
      // across layers; nlerp is plenty at the weights a crossfade uses.
      let dot = values[a] * values[b] + values[a + 1] * values[b + 1] + values[a + 2] * values[b + 2] + values[a + 3] * values[b + 3];
      const sign = dot < 0 ? -1 : 1;
      let x = values[a] + (values[b] * sign - values[a]) * t;
      let y = values[a + 1] + (values[b + 1] * sign - values[a + 1]) * t;
      let z = values[a + 2] + (values[b + 2] * sign - values[a + 2]) * t;
      let qw = values[a + 3] + (values[b + 3] * sign - values[a + 3]) * t;
      const o = node * 4;
      const r = this.rotation;
      if (first) { r[o] = x * w; r[o + 1] = y * w; r[o + 2] = z * w; r[o + 3] = qw * w; }
      else {
        dot = r[o] * x + r[o + 1] * y + r[o + 2] * z + r[o + 3] * qw;
        const s = dot < 0 ? -w : w;
        r[o] += x * s; r[o + 1] += y * s; r[o + 2] += z * s; r[o + 3] += qw * s;
      }
      return;
    }
    const target = channel.path === 'translation' ? this.translation : this.scale;
    const o = node * 3;
    for (let c = 0; c < 3; c++) {
      const v = values[a + c] + (values[b + c] - values[a + c]) * t;
      target[o + c] = first ? v * w : target[o + c] + v * w;
    }
  }

  /** Local matrices from the transforms, world matrices down the tree, joints per skin. */
  #pose() {
    const nodes = this.model.nodes;
    const t = { x: 0, y: 0, z: 0 };
    const q = { x: 0, y: 0, z: 0, w: 1 };
    const s = { x: 1, y: 1, z: 1 };
    for (const i of this.order) {
      const node = nodes[i];
      const local = this.local.subarray(i * 16, i * 16 + 16);
      if (node.matrix) local.set(node.matrix);
      else {
        t.x = this.translation[i * 3]; t.y = this.translation[i * 3 + 1]; t.z = this.translation[i * 3 + 2];
        const len = Math.hypot(this.rotation[i * 4], this.rotation[i * 4 + 1], this.rotation[i * 4 + 2], this.rotation[i * 4 + 3]) || 1;
        q.x = this.rotation[i * 4] / len; q.y = this.rotation[i * 4 + 1] / len; q.z = this.rotation[i * 4 + 2] / len; q.w = this.rotation[i * 4 + 3] / len;
        s.x = this.scale[i * 3]; s.y = this.scale[i * 3 + 1]; s.z = this.scale[i * 3 + 2];
        mat4.fromTRS(t, q, s, local);
      }
      const world = this.world.subarray(i * 16, i * 16 + 16);
      if (node.parent < 0) world.set(local);
      else mat4.multiply(this.world.subarray(node.parent * 16, node.parent * 16 + 16), local, world);
    }
    // This pose becomes last frame's before the new one overwrites it.
    for (let k = 0; k < this.joints.length; k++) this.previousJoints[k].set(this.joints[k]);
    this.model.skins.forEach((skin, k) => {
      const out = this.joints[k];
      skin.joints.forEach((jointNode, j) => {
        mat4.multiply(
          this.world.subarray(jointNode * 16, jointNode * 16 + 16),
          skin.inverseBind.subarray(j * 16, j * 16 + 16),
          out.subarray(j * 16, j * 16 + 16));
      });
    });
    // The first pose is its own previous. Before it there is no pose,
    // only the zeroed array, and reprojecting a limb from that would
    // smear the whole model across the screen on its opening frame.
    if (!this.posed) {
      for (let k = 0; k < this.joints.length; k++) this.previousJoints[k].set(this.joints[k]);
      this.posed = true;
    }
  }

  /** The joint matrices of a skin, model space, for the renderer. */
  jointMatrices(skin) {
    return this.joints[skin];
  }

  /** The same from last frame's pose, for motion vectors. */
  previousJointMatrices(skin) {
    return this.previousJoints[skin];
  }

  /** A node's world matrix in model space, for a part that rides a bone. */
  nodeMatrix(node) {
    return this.world.subarray(node * 16, node * 16 + 16);
  }
}
