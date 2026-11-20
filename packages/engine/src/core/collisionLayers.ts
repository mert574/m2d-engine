/**
 * The project's collision layers: named by the game, resolved to the bits
 * the physics world filters by. `m2d.project.json` declares `layers`, an
 * ordered list of up to sixteen names; a prefab's physics says which
 * `layer` it is on (the first declared when unset) and which it
 * `collidesWith` (every layer when unset). The engine knows exactly one
 * layer of its own: `none`, which collides with nothing — scenery, markers,
 * noclip. Underneath, a layer is a membership bit and `collidesWith` a
 * filter mask, which is what the solver and `body.setCollisionFilter` take.
 */
export class CollisionLayers {
  bits: Map<string, number>;

  /** `names`: the project's layer names, in bit order. */
  constructor(names: string[] = []) {
    if (names.length > 16) {
      throw new Error(`M2D: a project may declare at most 16 collision layers; got ${names.length}`);
    }
    this.bits = new Map();
    names.forEach((name, index) => {
      if (name === 'none') throw new Error("M2D: 'none' is the engine's own layer (collides with nothing) and cannot be declared");
      if (this.bits.has(name)) throw new Error(`M2D: collision layer '${name}' is declared twice`);
      this.bits.set(name, 1 << index);
    });
  }

  /** The declared names, in bit order. */
  get names(): string[] {
    return [...this.bits.keys()];
  }

  /**
   * A layer's membership bit. `none` is 0 — a body nothing collides with.
   */
  bit(name: string): number {
    if (name === 'none') return 0;
    const bit = this.bits.get(name);
    if (bit === undefined) {
      throw new Error(`M2D: no collision layer named '${name}' (m2d.project.json layers: ${this.names.join(', ') || 'none declared'})`);
    }
    return bit;
  }

  /**
   * A filter mask over the named layers; every layer when `names` is
   * undefined, nothing when it is empty.
   */
  mask(names?: string[]): number {
    if (names === undefined) return 0xFFFF;
    let bits = 0;
    for (const name of names) bits |= this.bit(name);
    return bits;
  }
}
