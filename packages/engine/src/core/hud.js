import { UIText } from './ui/text.js';
import { UIMeter } from './ui/meter.js';
import { UIMinimap } from './ui/minimap.js';
import { UIImage } from './ui/Image.js';
import { UIRectangle } from './ui/Rectangle.js';

/**
 * A level's HUD from its `hud` block: the overlay every level has drawn in
 * a hook so far — an objective line, a health meter, a notice that fades,
 * a minimap, a hint — as scene data the editor shows and edits.
 *
 * Each element is one of the UI scene's kinds (`text`, `image`, `rect`)
 * or one of three that read the running game: a `meter` bound to a
 * constraint's fields on an object (the player's health by default), a
 * `notice` that rules write to and that fades after a moment, a `minimap`
 * that plots the prefabs it names. Built in edit mode too, so the editor
 * shows the HUD over the level; a meter then reads the entity's starting
 * values.
 */

/** A text that shows for a while and fades. */
class UINotice extends UIText {
  constructor(options = {}) {
    super(options);
    this.remaining = 0;
    this.holdFor = options.seconds ?? 2.5;
    this.fade = 0.6;
  }

  show(text, seconds = this.holdFor) {
    this.text = text;
    this.remaining = seconds + this.fade;
    this.visible = true;
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (this.remaining <= 0) return;
    this.remaining -= deltaTime;
    this.opacity = Math.max(0, Math.min(1, this.remaining / this.fade));
    if (this.remaining <= 0) { this.visible = false; this.opacity = 1; }
  }
}

export class SceneHud {
  /**
   * @param {import('./scene.js').Scene} scene
   * @param {Array<object>} elements - `hud`, validated
   */
  constructor(scene, elements = []) {
    this.scene = scene;
    this.game = scene.game;
    /** Elements by id, for rules and game code. @type {Map<string, object>} */
    this.elements = new Map();
    this.firstNotice = null;
    for (const element of elements) this.#build(element);
  }

  #entity(id) {
    if (id === 'player' || id === undefined) return this.game.player ?? null;
    return this.scene.entitiesById.get(id) ?? null;
  }

  #build(element) {
    const common = { x: element.x, y: element.y, anchor: element.anchor };
    const properties = element.properties ?? {};
    let made = null;
    switch (element.type) {
      case 'text':
        made = new UIText({ ...common, ...textLook(properties), text: properties.text });
        break;
      case 'notice':
        made = new UINotice({
          ...common, ...textLook(properties), text: '',
          fontSize: properties.fontSize ?? '28px', fontWeight: properties.fontWeight ?? '600', align: properties.align ?? 'center', seconds: properties.seconds
        });
        made.visible = false;
        if (!this.firstNotice) this.firstNotice = made;
        break;
      case 'meter': {
        const bind = element.bind ?? {};
        const read = () => {
          const entity = this.#entity(bind.object);
          if (!entity || entity.dead) return null;
          // The player's health by default; an empty constraint name reads the entity's own fields.
          const slot = bind.constraint ?? 'health';
          const source = slot ? entity.getConstraint?.(slot) : entity;
          if (!source) return null;
          const current = source[bind.current ?? 'currentHealth'];
          const max = source[bind.max ?? 'maxHealth'];
          if (typeof current !== 'number') return null;
          return typeof max === 'number' ? { current, max } : current;
        };
        const colour = properties.low
          ? (k) => (k < (properties.lowBelow ?? 0.35) ? properties.low : properties.color)
          : properties.color;
        made = new UIMeter(read, { ...common, width: element.width ?? 180, height: element.height ?? 12, label: properties.label, color: colour, background: properties.background });
        break;
      }
      case 'minimap': {
        const world = this.scene.config.world ?? {};
        const bounds = element.bounds ?? { width: world.width ?? this.game.options.worldWidth ?? 1000, height: world.height ?? this.game.options.worldHeight ?? 1000 };
        const plots = element.plot ?? {};
        made = new UIMinimap(this.game, {
          ...common, bounds, size: element.size ?? 160, background: properties.background,
          plot: (entity) => {
            const style = entity.prefab ? plots[entity.prefab] : undefined;
            if (style === undefined) return null;
            return typeof style === 'string' ? { shape: 'dot', color: style, size: 3 } : style;
          }
        });
        break;
      }
      case 'image':
        if (element.sprite) made = new UIImage({ ...common, image: this.scene.sprites.get(element.sprite), width: properties.width, height: properties.height, imageScale: properties.scale });
        break;
      case 'rect':
        made = new UIRectangle({ ...common, width: element.width, height: element.height, color: element.color, fill: element.fill ?? false, interactive: false });
        break;
      default:
        break;
    }
    if (!made) return;
    this.scene.ui.add(made);
    if (element.id) this.elements.set(element.id, made);
  }

  /** Show a notice: on the element named, else the first notice element. */
  notice(text, seconds, elementId) {
    const target = (elementId && this.elements.get(elementId)) || this.firstNotice;
    if (target?.show) target.show(text, seconds);
    else if (target) target.text = text;
  }

  /** Set a text element's text by id. */
  setText(elementId, text) {
    const target = this.elements.get(elementId);
    if (target) target.text = text;
  }
}

/** A HUD text's look, as `UIText` takes it. */
function textLook(properties) {
  return {
    color: properties.color, fontSize: properties.fontSize, fontFamily: properties.fontFamily,
    fontWeight: properties.fontWeight, fontStyle: properties.fontStyle, align: properties.align,
    letterSpacing: properties.letterSpacing, outlineColor: properties.outlineColor, outlineWidth: properties.outlineWidth
  };
}
