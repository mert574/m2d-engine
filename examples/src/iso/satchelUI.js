import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { UIScreen } from 'm2d-engine/core/ui/screen.js';
import { UIPanel } from 'm2d-engine/core/ui/panel.js';
import { UIText } from 'm2d-engine/core/ui/text.js';
import { UIMenuItem } from 'm2d-engine/core/ui/menuItem.js';
import { Stack, Spacer } from 'm2d-engine/core/ui/layout/stack.js';
import { WARES, WARE_IDS, SATCHEL_SIZE, purse } from './keepIntents.js';

/**
 * The satchel and the shop: the keep's presentation of its intents.
 *
 * Neither screen changes anything itself. Choosing an item opens a small
 * menu of what can be done with it, and choosing an action sends an intent
 * as the local player and shows what came back, the same way an online
 * client would. A click and Enter do the same thing everywhere.
 *
 * The screens block input without pausing: on a server the world cannot
 * stop for one player's menu. While one is up the input snapshot carries
 * nothing, and a click the UI took never reaches the world, so closing a
 * menu does not send the knight walking to where the cursor was.
 *
 * Rows are rebuilt from the purse and the quartermaster's stock every
 * frame, so what is shown is never older than the last tick, including
 * stock another player just bought.
 */

const REASONS = {
  'not-enough-embers': 'Not enough embers',
  'satchel-full': 'The satchel is full',
  'sold-out': 'Sold out',
  'empty-slot': 'Nothing there',
  'too-far': 'Too far from the quartermaster',
  'no-such-entity': 'The quartermaster has gone',
  unhurt: 'Nothing to heal',
  'no-avatar': 'No one to use it',
  rate: 'Not so fast'
};

const BORDER = 'rgba(255, 200, 140, 0.45)';

/** The HUD strip: the ember count and six small slots. */
export class SatchelBar extends UIElement {
  constructor(player, options = {}) {
    // Above the engine's frame-rate readout, which sits in the bottom-left corner.
    super({ anchor: 'bottom-left', pivot: 'bottom-left', x: 20, y: -64, width: SATCHEL_SIZE * 34 - 6, height: 48, ...options });
    this.player = player;
  }

  draw() {
    const mine = purse(this.player);
    const f = this.frame;
    const paint = this.paint;
    paint.drawText({ x: f.x, y: f.y, text: `EMBERS  ${mine.embers}`, fillStyle: '#ffc890', fontSize: 12, letterSpacing: 2, textBaseline: 'top' });
    mine.satchel.forEach((ware, i) => {
      const x = f.x + i * 34;
      const y = f.y + 20;
      paint.drawRect({ x, y, width: 28, height: 28, fillStyle: 'rgba(12, 18, 14, 0.84)', strokeStyle: BORDER, lineWidth: 1.5, cornerRadius: 6 });
      if (!ware) return;
      paint.drawText({ x: x + 14, y: y + 14, text: WARES[ware].short, fillStyle: WARES[ware].color, fontSize: 15, fontWeight: '700', textAlign: 'center', textBaseline: 'middle' });
    });
    paint.drawText({ x: f.x + f.width + 10, y: f.y + 34, text: 'I', fillStyle: 'rgba(240, 230, 220, 0.5)', fontSize: 12, textBaseline: 'middle' });
  }
}

/**
 * What can be done with one item: a small menu beside the row it came
 * from. Choosing an action runs it and closes the menu; Escape or a click
 * anywhere outside closes it without doing anything.
 */
class ItemOptions extends UIScreen {
  /**
   * @param {object} anchor - The row's frame, in UI units
   * @param {string} heading
   * @param {string} detail - A line about the item, under the heading
   * @param {Array<{text: string, run: () => void}>} actions
   */
  constructor(anchor, heading, detail, actions) {
    super({ name: 'itemOptions', blocking: true, scrim: false, pauseGame: false, transition: 'fade' });
    this.panel = this.add(new UIPanel({
      anchor: 'top-left', pivot: 'top-left',
      x: anchor.x + anchor.width + 44, y: anchor.y - 10,
      padding: { top: 12, right: 18, bottom: 10, left: 18 },
      fitContent: true, cornerRadius: '$radius.sm', elevation: 'high',
      borderColor: BORDER, interactive: true
    }));
    const stack = this.panel.add(new Stack({ anchor: 'top-left', direction: 'column', width: 220, gap: 0, align: 'stretch' }));
    stack.add(new UIText({ text: heading, align: 'left', fontSize: '$font.size.micro', letterSpacing: '$font.tracking.widest', color: '$color.text.accent', pivot: 'top-left' }));
    stack.add(new Spacer({ size: 2 }));
    stack.add(new UIText({ text: detail, align: 'left', fontSize: 13, color: '$color.text.secondary', pivot: 'top-left' }));
    stack.add(new Spacer({ size: 6 }));
    for (const action of actions) {
      stack.add(new UIMenuItem({
        text: action.text, height: 32, fontSize: 15, uppercase: false, letterSpacing: 0,
        onSelect: () => { this.close(); action.run(); }
      }));
    }
    stack.add(new UIMenuItem({ text: 'Cancel', height: 32, fontSize: 15, uppercase: false, letterSpacing: 0, onSelect: () => this.close() }));
  }

  handleInput(event) {
    if (event.type === 'pointerdown' && !this.isExiting && !this.panel.contains(event.ui.x, event.ui.y)) {
      this.close();
      event.consume();
      return;
    }
    super.handleInput(event);
  }
}

/** The chrome both screens share: a panel, an eyebrow, a title, rows, a status line and a hint. */
class KeepScreen extends UIScreen {
  constructor(game, player, { name, eyebrow, hint }) {
    super({ name, blocking: true, scrim: true, pauseGame: false, transition: 'fade' });
    this.keep = game;
    this.player = player;
    this.hint = hint;
    const panel = this.add(new UIPanel({
      anchor: 'center', pivot: 'center',
      padding: { top: 24, right: 30, bottom: 18, left: 30 },
      fitContent: true, cornerRadius: '$radius.sm', elevation: 'high',
      borderColor: BORDER, interactive: true
    }));
    this.stack = panel.add(new Stack({ anchor: 'top-left', direction: 'column', width: 480, gap: 0, align: 'stretch' }));
    this.stack.add(new UIText({ text: eyebrow, align: 'left', fontSize: '$font.size.micro', fontWeight: '$font.weight.semibold', letterSpacing: '$font.tracking.widest', color: '$color.text.accent', pivot: 'top-left' }));
    this.stack.add(new Spacer({ size: 2 }));
    this.title = this.stack.add(new UIText({ text: '', align: 'left', fontSize: '$font.size.title', fontWeight: '$font.weight.thin', letterSpacing: '$font.tracking.tight', color: '$color.text.primary', pivot: 'top-left' }));
    this.stack.add(new Spacer({ size: '$space.md' }));
  }

  /** A tracked caption over a group of rows. */
  caption(text) {
    this.stack.add(new Spacer({ size: 8 }));
    this.stack.add(new UIText({ text, align: 'left', fontSize: '$font.size.micro', letterSpacing: '$font.tracking.widest', color: '$color.text.muted', pivot: 'top-left' }));
    this.stack.add(new Spacer({ size: 4 }));
  }

  /** A row whose click and Enter both call `onSelect(row)`. */
  row(onSelect) {
    const row = this.stack.add(new UIMenuItem({ text: '', height: 34, fontSize: 16, uppercase: false, letterSpacing: 0 }));
    row.onSelect = () => onSelect(row);
    return row;
  }

  /** The status line and the controls hint, under the rows. Call last. */
  finish() {
    this.stack.add(new Spacer({ size: '$space.sm' }));
    this.status = this.stack.add(new UIText({ text: '', align: 'left', fontSize: 14, color: '#ffc890', pivot: 'top-left' }));
    this.stack.add(new Spacer({ size: 6 }));
    this.stack.add(new UIText({ text: this.hint, align: 'left', fontSize: '$font.size.micro', letterSpacing: 1, color: '$color.text.muted', pivot: 'top-left' }));
    this.refresh();
  }

  say(text) {
    this.status.text = text;
  }

  /** Open the options menu for a row. */
  options(row, ware, actions) {
    this.keep.ui.push(new ItemOptions(row.frame, WARES[ware].name.toUpperCase(), WARES[ware].describe, actions));
  }

  /** Send as the local player and show the outcome. */
  async send(name, args, done) {
    const result = await this.player.send(name, args);
    if (this.isExiting || !this.owner) return;
    this.say(result.ok ? done : (REASONS[result.reason] ?? result.reason));
  }

  updateTree(deltaTime) {
    // Before layout, so the rows measure the text they will draw.
    this.refresh();
    super.updateTree(deltaTime);
  }

  /** Rebuild the rows' text from the simulation. */
  refresh() {}
}

/** `I`: the satchel. Choose an item to use it or move it. */
export class SatchelScreen extends KeepScreen {
  constructor(game, player) {
    super(game, player, { name: 'satchel', eyebrow: 'SATCHEL', hint: '↑↓ Navigate · Enter or click an item · I close' });
    /** The slot an item is being moved from, while choosing where it goes. */
    this.moving = null;
    this.rows = [];
    for (let i = 0; i < SATCHEL_SIZE; i++) {
      const row = this.row(() => this.choose(i, row));
      this.rows.push(row);
    }
    this.finish();
  }

  choose(slot, row) {
    if (this.moving !== null) {
      const from = this.moving;
      this.moving = null;
      if (from !== slot) this.send('moveItem', { from, to: slot }, 'Moved');
      else this.say('');
      return;
    }
    const ware = purse(this.player).satchel[slot];
    if (!ware) return;
    this.options(row, ware, [
      { text: 'Use', run: () => this.send('use', { slot }, `Used ${WARES[ware].name}`) },
      { text: 'Move', run: () => { this.moving = slot; this.say(`Choose where the ${WARES[ware].name.toLowerCase()} goes`); } }
    ]);
  }

  refresh() {
    const mine = purse(this.player);
    this.title.text = `Embers · ${mine.embers}`;
    this.rows.forEach((row, i) => {
      const ware = mine.satchel[i];
      const moving = this.moving === i ? '  ·  moving' : '';
      row.text = `${i + 1}   ${ware ? `${WARES[ware].name}  ·  ${WARES[ware].describe}` : '—'}${moving}`;
      // Any slot can take a moved item; only a full one has options.
      row.enabled = this.moving !== null || Boolean(ware);
    });
  }

  handleInput(event) {
    if (event.type === 'keydown' && !this.isExiting) {
      if (event.code === 'KeyI') { this.close(); event.consume(); return; }
      if (event.code === 'Escape' && this.moving !== null) {
        this.moving = null;
        this.say('');
        event.consume();
        return;
      }
    }
    super.handleInput(event);
  }
}

/** `E` by the quartermaster: buy his wares, sell what is in the satchel. */
export class ShopScreen extends KeepScreen {
  constructor(game, player, vendor) {
    super(game, player, { name: 'shop', eyebrow: 'QUARTERMASTER', hint: '↑↓ Navigate · Enter or click an item · Esc close' });
    this.vendor = vendor;
    this.caption('BUY');
    this.buyRows = WARE_IDS.map((ware) => this.row((row) => this.chooseWare(ware, row)));
    this.caption('SELL');
    this.sellRows = [];
    for (let i = 0; i < SATCHEL_SIZE; i++) this.sellRows.push(this.row((row) => this.chooseSlot(i, row)));
    this.finish();
  }

  chooseWare(ware, row) {
    const { name, price } = WARES[ware];
    this.options(row, ware, [
      { text: `Buy for ${price} embers`, run: () => this.send('buy', { vendor: this.vendor.netId, ware }, `Bought ${name}`) }
    ]);
  }

  chooseSlot(slot, row) {
    const ware = purse(this.player).satchel[slot];
    if (!ware) return;
    const { name, price } = WARES[ware];
    this.options(row, ware, [
      { text: `Sell for ${Math.floor(price / 2)} embers`, run: () => this.send('sell', { vendor: this.vendor.netId, slot }, `Sold ${name}`) }
    ]);
  }

  refresh() {
    const mine = purse(this.player);
    const stock = this.vendor.stock ?? {};
    this.title.text = `Embers · ${mine.embers}`;
    this.buyRows.forEach((row, k) => {
      const id = WARE_IDS[k];
      const { name, price } = WARES[id];
      const left = stock[id] ?? 0;
      row.text = `${name}  ·  ${price} embers  ·  ${left > 0 ? `${left} left` : 'sold out'}`;
      row.enabled = left > 0;
    });
    this.sellRows.forEach((row, i) => {
      const ware = mine.satchel[i];
      row.text = `${i + 1}   ${ware ? `${WARES[ware].name}  ·  sells for ${Math.floor(WARES[ware].price / 2)}` : '—'}`;
      row.enabled = Boolean(ware);
    });
  }
}
