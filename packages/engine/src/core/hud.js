import { UIText } from './ui/text.js';
import { UIMeter } from './ui/meter.js';
import { UIMinimap } from './ui/minimap.js';
import { UIAbilityBar } from './ui/abilityBar.js';
import { UIDialogue } from './ui/dialogue.js';
import { UIImage } from './ui/Image.js';
import { UIRectangle } from './ui/Rectangle.js';
import { boundEntity, readBinding } from './binding.js';
import { fillTemplate } from './counters.js';

/**
 * A level's HUD from its `hud` block: the overlay every level has drawn in
 * a hook so far — an objective line, a health meter, a notice that fades,
 * a minimap, an ability bar, a dialogue, a hint — as scene data the editor
 * shows and edits.
 *
 * Each element is one of the UI scene's kinds (`text`, `image`, `rect`)
 * or one that reads the running game: a `meter` bound to a constraint's
 * fields on an object (the player's health by default), a `notice` that
 * rules write to and that fades after a moment, a `minimap` that plots the
 * prefabs it names, an `abilityBar` over an `Abilities` constraint, and a
 * `dialogue` that `say` rules open. A text's `{name}` shows the level's
 * counter of that name. Built in edit mode too, so the editor shows the
 * HUD over the level; a meter then reads the entity's starting values.
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

/** A text whose `{name}` holes show the level's counters, re-read every frame. */
class UITemplateText extends UIText {
  constructor(template, counters, options) {
    super({ ...options, text: fillTemplate(template, counters) });
    this.template = template;
    this.counters = counters;
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.text = fillTemplate(this.template, this.counters);
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
    this.firstDialogue = null;
    /** Minimaps whose `target` names an object, resolved once the objects stand. */
    this.targets = [];
    for (const element of elements) this.#build(element);
    for (const { minimap, id } of this.targets) minimap.target = boundEntity(scene, id);
  }

  #build(element) {
    const common = { x: element.x, y: element.y, anchor: element.anchor };
    const properties = element.properties ?? {};
    const made = this.#make(element, common, properties);
    if (!made) return;
    this.scene.ui.add(made);
    if (element.id) this.elements.set(element.id, made);
  }

  #make(element, common, properties) {
    switch (element.type) {
      case 'text': {
        const options = { ...common, ...textLook(properties) };
        return typeof properties.text === 'string' && properties.text.includes('{')
          ? new UITemplateText(properties.text, this.scene.counters, options)
          : new UIText({ ...options, text: properties.text });
      }
      case 'notice': {
        const made = new UINotice({
          ...common, ...textLook(properties), text: '',
          fontSize: properties.fontSize ?? '28px', fontWeight: properties.fontWeight ?? '600', align: properties.align ?? 'center', seconds: properties.seconds
        });
        made.visible = false;
        this.firstNotice ??= made;
        return made;
      }
      case 'meter':
        return new UIMeter(() => readBinding(this.scene, element.bind), {
          ...common, width: element.width ?? 180, height: element.height ?? 12,
          label: properties.label, color: meterColour(properties), background: properties.background
        });
      case 'minimap':
        return this.#minimap(element, common, properties);
      case 'abilityBar': {
        const bind = element.bind ?? {};
        const icons = Object.fromEntries(Object.entries(element.icons ?? {}).map(([ability, key]) => [ability, this.scene.sprites.get(key)]).filter(([, image]) => image));
        return new UIAbilityBar(() => boundEntity(this.scene, bind.object)?.getConstraint?.(bind.constraint ?? 'abilities') ?? null, {
          ...placed(common), icons, slot: properties.slot, gap: properties.gap,
          ...(properties.background && { background: properties.background }),
          ...(properties.borderColor && { borderColor: properties.borderColor })
        });
      }
      case 'dialogue': {
        const made = new UIDialogue({
          ...placed(common), width: element.width ?? 720, height: element.height ?? 128,
          charsPerSecond: properties.charsPerSecond,
          ...(properties.clock === 'game' && { clock: () => this.game.time.elapsed }),
          advanceHint: this.#advanceHint(properties.advance),
          ...(properties.textColor && { textColor: properties.textColor }),
          ...(properties.nameColor && { nameColor: properties.nameColor }),
          ...(properties.background && { background: properties.background }),
          ...(properties.borderColor && { borderColor: properties.borderColor })
        });
        // An empty advance action: game code drives the conversation.
        made.advanceAction = properties.advance ?? 'interact';
        this.firstDialogue ??= made;
        return made;
      }
      case 'component': {
        const make = this.game.hudComponents?.get(element.component);
        if (!make) {
          console.warn(`M2D hud: no HUD component '${element.component}' is registered (game.registerHudComponent)`);
          return null;
        }
        return make(this.scene, { ...placed(common), properties });
      }
      case 'image':
        return element.sprite
          ? new UIImage({ ...common, image: this.scene.sprites.get(element.sprite), width: properties.width, height: properties.height, imageScale: properties.scale })
          : null;
      case 'rect':
        return new UIRectangle({ ...common, width: element.width, height: element.height, color: element.color, fill: element.fill ?? false, interactive: false });
      default:
        return null;
    }
  }

  #minimap(element, common, properties) {
    const world = this.scene.config.world ?? {};
    const bounds = element.bounds ?? { width: world.width ?? this.game.options.worldWidth ?? 1000, height: world.height ?? this.game.options.worldHeight ?? 1000 };
    const plots = element.plot ?? {};
    const minimap = new UIMinimap(this.game, {
      ...common, bounds, size: element.size ?? 160, background: properties.background,
      ...(properties.borderColor && { borderColor: properties.borderColor }),
      plot: (entity) => {
        const style = plots[entity.prefab] ?? (isOtherPlayer(this.game, entity) ? plots.players : undefined);
        return style === undefined ? null : plotStyle(style, entity);
      }
    });
    if (element.target) this.targets.push({ minimap, id: element.target });
    return minimap;
  }

  /** The key a dialogue's hint names: its advance action's first key, else E. */
  #advanceHint(action = 'interact') {
    const code = this.game.actions?.codes(action)[0] ?? 'KeyE';
    return code.replace(/^Key|^Digit/, '');
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
    if (!target) return;
    if (target instanceof UITemplateText) target.template = text;
    target.text = fillTemplate(text, this.scene.counters);
  }

  /** Open a dialogue on these lines: the element named, else the first dialogue. */
  say(speaker, lines, elementId) {
    const dialogue = (elementId && this.elements.get(elementId)) || this.firstDialogue;
    dialogue?.start?.(speaker, lines);
  }

  /**
   * The dialogues hear their advance action and a click. Presentation:
   * the scene calls it when it shows, never in edit mode.
   */
  listen() {
    const input = this.game.input;
    if (!input?.on) return;
    const dialogues = [...this.elements.values()].filter((element) => element instanceof UIDialogue && element.advanceAction);
    if (!dialogues.length) return;
    const advance = (event) => {
      const open = dialogues.find((dialogue) => dialogue.open);
      if (!open) return;
      open.advance();
      event.consume?.();
    };
    this.#off.push(input.on('keydown', (event) => {
      const open = dialogues.find((dialogue) => dialogue.open);
      if (!open || event.consumed) return;
      const codes = this.game.actions?.codes(open.advanceAction);
      if ((codes?.length ? codes : ['KeyE']).includes(event.code)) advance(event);
    }));
    this.#off.push(input.on('pointerdown', (event) => { if (!event.consumed) advance(event); }));
  }

  #off = [];

  unlisten() {
    for (const off of this.#off) off();
    this.#off = [];
  }
}

/**
 * Position for an element whose class has its own anchor default (the
 * ability bar and the dialogue sit at the bottom centre): only what the
 * scene set, so an unset anchor keeps the class's.
 */
function placed(common) {
  return Object.fromEntries(Object.entries(common).filter(([, value]) => value !== undefined));
}

/** A meter's colour: full, low, or the resting one, by how full it is. */
function meterColour(properties) {
  if (!properties.low && !properties.full) return properties.color;
  return (k) => {
    if (properties.full && k >= 1) return properties.full;
    if (properties.low && k < (properties.lowBelow ?? 0.35)) return properties.low;
    return properties.color;
  };
}

/** Whether an entity is another player's avatar, for a minimap's `players` entry. */
function isOtherPlayer(game, entity) {
  return entity.name === 'Player' && entity !== game.player && !entity.dead;
}

/** A plot entry as `UIMinimap` draws it, with `by` read off the entity. */
function plotStyle(style, entity) {
  if (typeof style === 'string') return { shape: 'dot', color: style, size: 3 };
  const { by, ...rest } = style;
  const base = { shape: 'dot', size: 3, ...rest };
  if (!by) return base;
  const value = entity[by.property];
  return { ...base, ...(by.values?.[String(value)] ?? {}) };
}

/** A HUD text's look, as `UIText` takes it. */
function textLook(properties) {
  return {
    color: properties.color, fontSize: properties.fontSize, fontFamily: properties.fontFamily,
    fontWeight: properties.fontWeight, fontStyle: properties.fontStyle, align: properties.align,
    letterSpacing: properties.letterSpacing, outlineColor: properties.outlineColor, outlineWidth: properties.outlineWidth
  };
}
