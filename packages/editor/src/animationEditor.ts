/**
 * The animation editor (E8): one sprite sheet's `animations`, made by
 * clicking frames on the sheet instead of typing tuples.
 *
 * A modal over the editor. The sheet draws with its frame grid; a click
 * appends that frame to the open animation. The frame strip below shows
 * the sequence (remove one, nudge it left or right), with fps and loop
 * beside it and a live preview running on the dialog's own clock — edit
 * mode never advances an entity's animation time, so the preview cannot
 * lean on the viewport. Every change commits as one labelled edit, so it
 * lands in the undo history and in any other tab at once. The same
 * dialog owns **slicing**: the sheet's `frameWidth` and `frameHeight`,
 * with the grid following.
 */

import { isPlainObject, type Op } from 'm2d-editor-core';

export interface AnimationEditorCallbacks {
  doc(): Record<string, unknown> | null;
  edit(label: string, ops: Op[]): void;
  say(text: string): void;
  /** The URL the sheet's image loads from. */
  sheetUrl(sheet: string): string | null;
  readOnly(): boolean;
}

export interface AnimationEditorHandle {
  open(sheetKey: string): void;
}

interface Animation {
  frames: Array<[number, number]>;
  fps?: number;
  loop?: boolean;
}

export function createAnimationEditor(callbacks: AnimationEditorCallbacks): AnimationEditorHandle {
  const dialog = document.createElement('dialog');
  dialog.id = 'animations';
  document.body.append(dialog);
  let sheetKey = '';
  let current = '';
  let clock: number | null = null;

  const close = (): void => {
    if (clock !== null) cancelAnimationFrame(clock);
    clock = null;
    dialog.close();
  };
  dialog.addEventListener('close', () => { if (clock !== null) cancelAnimationFrame(clock); clock = null; });

  const sheet = (): Record<string, unknown> | null => {
    const doc = callbacks.doc();
    const assets = doc && isPlainObject(doc.assets) ? doc.assets : null;
    const sheets = assets && isPlainObject(assets.spritesheets) ? assets.spritesheets : null;
    const entry = sheets && isPlainObject(sheets[sheetKey]) ? sheets[sheetKey] as Record<string, unknown> : null;
    return entry;
  };

  const animations = (): Record<string, Animation> => {
    const entry = sheet();
    return entry && isPlainObject(entry.animations) ? entry.animations as unknown as Record<string, Animation> : {};
  };

  const path = (...rest: Array<string | number>) => ['assets', 'spritesheets', sheetKey, ...rest];

  const writeAnimation = (name: string, value: Animation, label: string): void => {
    const clean: Record<string, unknown> = { frames: value.frames };
    if (value.fps !== undefined) clean.fps = value.fps;
    if (value.loop !== undefined) clean.loop = value.loop;
    callbacks.edit(label, [{ op: 'set', path: path('animations', name), value: clean }]);
    render();
  };

  const render = (): void => {
    if (clock !== null) cancelAnimationFrame(clock);
    clock = null;
    dialog.replaceChildren();
    const entry = sheet();
    if (!entry) { close(); return; }
    const frameWidth = typeof entry.frameWidth === 'number' ? entry.frameWidth : 32;
    const frameHeight = typeof entry.frameHeight === 'number' ? entry.frameHeight : frameWidth;
    const editable = !callbacks.readOnly();
    const anims = animations();
    if (!(current in anims)) current = Object.keys(anims)[0] ?? '';
    const animation = anims[current];

    const head = document.createElement('div');
    head.className = 'anim-head';
    const title = document.createElement('h2');
    title.textContent = `Animations · ${sheetKey}`;
    head.append(title);
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Done';
    done.addEventListener('click', close);
    head.append(done);
    dialog.append(head);

    // --- Slicing: the frame size, with the grid following. ---
    const slice = document.createElement('div');
    slice.className = 'anim-slice';
    const sizeField = (label: string, key: 'frameWidth' | 'frameHeight', value: number): void => {
      const wrap = document.createElement('label');
      wrap.append(document.createTextNode(label));
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.value = String(value);
      input.disabled = !editable;
      input.addEventListener('change', () => {
        const next = Number(input.value);
        if (Number.isFinite(next) && next > 0) callbacks.edit(`Slice ${sheetKey} to ${next}px ${key === 'frameWidth' ? 'wide' : 'tall'}`, [{ op: 'set', path: path(key), value: next }]);
        render();
      });
      wrap.append(input);
      slice.append(wrap);
    };
    sizeField('Frame width', 'frameWidth', frameWidth);
    sizeField('Frame height', 'frameHeight', frameHeight);
    dialog.append(slice);

    const body = document.createElement('div');
    body.className = 'anim-body';
    dialog.append(body);

    // --- The sheet, its grid, a click appends a frame. ---
    const sheetBox = document.createElement('div');
    sheetBox.className = 'anim-sheet';
    const url = callbacks.sheetUrl(sheetKey);
    const img = document.createElement('img');
    if (url) img.src = url;
    img.draggable = false;
    const grid = document.createElement('div');
    grid.className = 'anim-grid';
    sheetBox.append(img, grid);
    body.append(sheetBox);
    const sizeGrid = (): void => {
      const zoom = img.clientWidth / (img.naturalWidth || 1);
      grid.style.backgroundSize = `${frameWidth * zoom}px ${frameHeight * zoom}px`;
    };
    img.addEventListener('load', sizeGrid);
    sizeGrid();
    img.addEventListener('click', (event) => {
      if (!editable || !img.naturalWidth || !current) {
        if (!current) callbacks.say('Add an animation first');
        return;
      }
      const box = img.getBoundingClientRect();
      const zoom = box.width / img.naturalWidth;
      const tx = Math.max(0, Math.floor((event.clientX - box.left) / (frameWidth * zoom)));
      const ty = Math.max(0, Math.floor((event.clientY - box.top) / (frameHeight * zoom)));
      const anim = animations()[current];
      if (!anim) return;
      writeAnimation(current, { ...anim, frames: [...anim.frames, [tx, ty]] }, `Add frame ${tx},${ty} to ${current}`);
    });

    // --- The animations and the open one's sequence. ---
    const side = document.createElement('div');
    side.className = 'anim-side';
    body.append(side);

    const list = document.createElement('div');
    list.className = 'anim-list';
    for (const name of Object.keys(anims)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.setAttribute('aria-pressed', String(name === current));
      button.addEventListener('click', () => { current = name; render(); });
      list.append(button);
    }
    if (editable) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'anim-add';
      add.textContent = '+ New';
      add.addEventListener('click', () => {
        const name = prompt('Animation name', 'idle');
        if (!name) return;
        if (name in animations()) { callbacks.say(`'${name}' is already there`); return; }
        current = name;
        writeAnimation(name, { frames: [] }, `Add animation ${name}`);
      });
      list.append(add);
    }
    side.append(list);

    if (animation) {
      const strip = document.createElement('div');
      strip.className = 'anim-frames';
      animation.frames.forEach((frame, index) => {
        const chip = document.createElement('span');
        chip.className = 'anim-frame';
        chip.textContent = `${frame[0]},${frame[1]}`;
        if (editable) {
          const nudge = (delta: number): void => {
            const frames = [...animation.frames];
            const to = index + delta;
            if (to < 0 || to >= frames.length) return;
            [frames[index], frames[to]] = [frames[to]!, frames[index]!];
            writeAnimation(current, { ...animation, frames }, `Reorder ${current}`);
          };
          const left = document.createElement('button');
          left.type = 'button';
          left.textContent = '‹';
          left.title = 'Earlier';
          left.addEventListener('click', () => nudge(-1));
          const right = document.createElement('button');
          right.type = 'button';
          right.textContent = '›';
          right.title = 'Later';
          right.addEventListener('click', () => nudge(1));
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = '×';
          remove.title = 'Remove this frame';
          remove.addEventListener('click', () => {
            writeAnimation(current, { ...animation, frames: animation.frames.filter((_, i) => i !== index) }, `Remove a frame of ${current}`);
          });
          chip.prepend(left);
          chip.append(right, remove);
        }
        strip.append(chip);
      });
      if (!animation.frames.length) {
        const hint = document.createElement('span');
        hint.className = 'muted';
        hint.textContent = 'Click frames on the sheet to add them.';
        strip.append(hint);
      }
      side.append(strip);

      const tune = document.createElement('div');
      tune.className = 'anim-tune';
      const fps = document.createElement('label');
      fps.append(document.createTextNode('fps'));
      const fpsInput = document.createElement('input');
      fpsInput.type = 'number';
      fpsInput.min = '0';
      fpsInput.value = String(animation.fps ?? 0);
      fpsInput.disabled = !editable;
      fpsInput.addEventListener('change', () => {
        const value = Number(fpsInput.value);
        if (Number.isFinite(value) && value >= 0) writeAnimation(current, { ...animation, fps: value }, `Set ${current} to ${value} fps`);
      });
      fps.append(fpsInput);
      const loop = document.createElement('label');
      const loopInput = document.createElement('input');
      loopInput.type = 'checkbox';
      loopInput.checked = animation.loop !== false;
      loopInput.disabled = !editable;
      loopInput.addEventListener('change', () => writeAnimation(current, { ...animation, loop: loopInput.checked ? undefined : false }, `${loopInput.checked ? 'Loop' : 'Hold'} ${current}`));
      loop.append(loopInput, document.createTextNode('loop'));
      tune.append(fps, loop);
      if (editable && current) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Delete animation';
        remove.addEventListener('click', () => {
          if (!confirm(`Delete animation '${current}'?`)) return;
          callbacks.edit(`Delete animation ${current}`, [{ op: 'set', path: path('animations', current) }]);
          current = '';
          render();
        });
        tune.append(remove);
      }
      side.append(tune);

      // --- The preview, on its own clock: edit mode never animates. ---
      const preview = document.createElement('canvas');
      preview.className = 'anim-preview';
      preview.width = frameWidth * 2;
      preview.height = frameHeight * 2;
      side.append(preview);
      const context = preview.getContext('2d');
      const started = performance.now();
      const tick = (): void => {
        clock = requestAnimationFrame(tick);
        if (!context || !img.naturalWidth || !animation.frames.length) return;
        const rate = animation.fps ?? 0;
        const elapsed = (performance.now() - started) / 1000;
        const step = rate > 0 ? Math.floor(elapsed * rate) : 0;
        const index = animation.loop === false
          ? Math.min(step, animation.frames.length - 1)
          : step % animation.frames.length;
        const [tx, ty] = animation.frames[index]!;
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, preview.width, preview.height);
        context.drawImage(img, tx * frameWidth, ty * frameHeight, frameWidth, frameHeight, 0, 0, preview.width, preview.height);
      };
      tick();
    }
  };

  return {
    open(key: string) {
      sheetKey = key;
      current = Object.keys(animations())[0] ?? '';
      if (!sheet()) { callbacks.say(`No sprite sheet '${key}'`); return; }
      render();
      if (!dialog.open) dialog.showModal();
    }
  };
}
