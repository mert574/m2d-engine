import { defineIntents, reject, slot, oneOf, entity } from 'm2d-engine/net/intents.js';

/**
 * Cinder Keep's satchel and its quartermaster: what a player carries and
 * what they can do about it through intents.
 *
 * Walking, swinging and the abilities are held input; the keep's rules
 * work those out from keys and the world. Buying, selling, moving an item
 * between slots and using one are choices that exist only in a menu, so
 * they are intents: declared here, in the module the browser and a server
 * both import, validated from the declaration and run as the player who
 * sent them. `main.js` only draws the satchel and the shop and sends.
 */

export const SATCHEL_SIZE = 6;

/**
 * What the quartermaster trades. `stock` is how many he starts with; the
 * live count is on the Quartermaster entity, so it is simulation state.
 * Selling back pays half, rounded down, and returns the item to his stock.
 */
export const WARES = {
  tonic: { name: 'Ember tonic', price: 3, stock: 3, short: 'T', color: '#ff7a5a', describe: 'Heals 40' },
  charm: { name: 'Ward charm', price: 5, stock: 1, short: 'C', color: '#9ac8ff', describe: 'A shield for five seconds' },
  oil: { name: 'Torch oil', price: 2, stock: 2, short: 'O', color: '#ffd27a', describe: 'Readies every ability' }
};

export const WARE_IDS = Object.keys(WARES);

/** A fresh stock for a quartermaster. */
export function newStock() {
  return Object.fromEntries(WARE_IDS.map((id) => [id, WARES[id].stock]));
}

/** What a player starts with. */
export function newPurse() {
  return { embers: 0, satchel: Array(SATCHEL_SIZE).fill(null) };
}

/** A player's purse, made on first use so a player needs no setup to collect. */
export function purse(player) {
  if (!player.state.satchel) Object.assign(player.state, newPurse());
  return player.state;
}

/** The purse of whoever an entity belongs to: its player's, or the local player's. */
export function purseOf(entity) {
  return purse(entity.player ?? entity.game.players.local);
}

/** A collected ember goes to the collector's purse. */
export function creditEmber(collector) {
  purseOf(collector).embers += 1;
}

const VENDOR = entity({ actor: 'Quartermaster', within: 140 });

export const keepIntents = defineIntents({
  buy: {
    args: { vendor: VENDOR, ware: oneOf(WARE_IDS) },
    rate: 4,
    // Intents in one tick run one after another, so two players asking for
    // the last charm in the same tick are decided here: the first to run
    // takes it, the second finds the stock at zero.
    run(player, { vendor, ware }) {
      const mine = purse(player);
      if ((vendor.stock[ware] ?? 0) <= 0) return reject('sold-out');
      const free = mine.satchel.indexOf(null);
      if (free === -1) return reject('satchel-full');
      if (mine.embers < WARES[ware].price) return reject('not-enough-embers');
      mine.embers -= WARES[ware].price;
      vendor.stock[ware] -= 1;
      mine.satchel[free] = ware;
    }
  },
  sell: {
    args: { vendor: VENDOR, slot: slot(SATCHEL_SIZE) },
    rate: 4,
    run(player, { vendor, slot: at }) {
      const mine = purse(player);
      const ware = mine.satchel[at];
      if (!ware) return reject('empty-slot');
      mine.satchel[at] = null;
      mine.embers += Math.floor(WARES[ware].price / 2);
      vendor.stock[ware] = (vendor.stock[ware] ?? 0) + 1;
    }
  },
  moveItem: {
    args: { from: slot(SATCHEL_SIZE), to: slot(SATCHEL_SIZE) },
    rate: 10,
    run(player, { from, to }) {
      const mine = purse(player);
      if (mine.satchel[from] === null) return reject('empty-slot');
      if (from === to) return;
      [mine.satchel[from], mine.satchel[to]] = [mine.satchel[to], mine.satchel[from]];
    }
  },
  use: {
    args: { slot: slot(SATCHEL_SIZE) },
    rate: 4,
    run(player, { slot: at }) {
      const avatar = player.avatar;
      if (!avatar || avatar.dead) return reject('no-avatar');
      const mine = purse(player);
      const ware = mine.satchel[at];
      if (!ware) return reject('empty-slot');
      if (ware === 'tonic') {
        const health = avatar.getConstraint('health');
        if (!health || health.currentHealth >= health.maxHealth) return reject('unhurt');
        health.heal(40);
      } else if (ware === 'charm') {
        if (!avatar.effects) return reject('no-effect');
        avatar.effects.shieldLeft = 5;
      } else if (ware === 'oil') {
        const abilities = avatar.getConstraint('abilities');
        if (!abilities) return reject('no-effect');
        for (const ability of abilities.list) ability.remaining = 0;
      }
      mine.satchel[at] = null;
    }
  }
});
