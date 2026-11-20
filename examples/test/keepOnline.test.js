import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initPhysics } from 'm2d-engine/physics';
import { M2D } from 'm2d-engine';
import { NetClient } from 'm2d-engine/net';
import { createServer, issueTicket } from 'm2d-server';
import { KEEP_INPUT, KEEP_GAME, registerKeep, sceneHooks } from '../src/iso/game.js';
import { purse } from '../src/iso/keepIntents.js';

/**
 * Cinder Keep online: keepMatch.js on a real m2d-server, and two headless
 * clients built from the same game.js the browser plays. Clicks walk the
 * knights over the network, the embers and the quartermaster are shared,
 * and each purse is its owner's alone.
 */

const SECRET = 'k'.repeat(40);
const KEEP = JSON.parse(readFileSync(new URL('../src/iso/scenes/keep.json', import.meta.url), 'utf8'));
const TILE = 64;

let server;
let url;
const clients = [];

beforeAll(async () => {
  await initPhysics();
  server = createServer({ match: new URL('../src/iso/keepMatch.js', import.meta.url), secret: SECRET, host: '127.0.0.1' });
  url = `ws://127.0.0.1:${await server.start()}/play`;
});

afterAll(async () => {
  for (const client of clients) client.leave();
  await server.stop();
});

/** A client game for `player`; `script()` says what is held and clicked each tick. */
async function join(player) {
  const game = new M2D(null, { headless: true, ...KEEP_GAME });
  // The join banner would be one block per test in the suite's output.
  game.netLogLevel = 0;
  registerKeep(game);
  game.sceneManager.addScene('keep', { fetch: async () => KEEP, ...sceneHooks(game).keep });
  const input = { click: null, held: [] };
  game.input.setSnapshotSource(() => {
    const click = input.click;
    input.click = null;
    return {
      down: input.held,
      pointer: click
        ? { world: click, buttons: 1, isDown: true, pressed: true, pressedButtons: 1 }
        : { world: input.lastClick ?? { x: 0, y: 0 }, buttons: 0 }
    };
  });
  const net = await NetClient.connect(game, { url, ticket: issueTicket(SECRET, { player, match: 'keep' }), schema: KEEP_INPUT });
  const client = {
    game, net, input,
    click(point) { input.click = point; input.lastClick = point; },
    leave() { net.close(); }
  };
  clients.push(client);
  return client;
}

/**
 * Wait for `check`, pacing every client's game to its server between
 * polls. A wall-clock 60 Hz interval starves on a loaded machine and the
 * client falls behind its server (how this suite used to flake); stepping
 * once per poll runs *ahead* of the server's input gate and the clicks
 * are dropped as late. So each client steps exactly to where its server
 * is — `serverTick` plus the lead the client itself steers — catching up
 * in a burst after a stall and never overtaking the gate.
 */
async function until(check, timeout = 60000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting');
    for (const { game, net } of clients) {
      while (game.time.steps < net.serverTick + net.lead) game.step(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Floor cells a knight can stand on: the tile layer's cells minus the walls. */
function walkable() {
  const walls = new Set(KEEP.layers[0].objects.filter((o) => o.prefab.startsWith('wall')).map((o) => `${Math.floor(o.x / TILE)},${Math.floor(o.y / TILE)}`));
  return new Set(KEEP.tileLayers[0].cells.map(([i, j]) => `${i},${j}`).filter((key) => !walls.has(key)));
}

/** Cell centres from one point to another, by breadth-first search over the floor. */
function route(from, to) {
  const open = walkable();
  const start = `${Math.floor(from.x / TILE)},${Math.floor(from.y / TILE)}`;
  const goal = `${Math.floor(to.x / TILE)},${Math.floor(to.y / TILE)}`;
  const came = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const key = queue.shift();
    if (key === goal) break;
    const [i, j] = key.split(',').map(Number);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = `${i + di},${j + dj}`;
      if (open.has(next) && !came.has(next)) { came.set(next, key); queue.push(next); }
    }
  }
  const path = [];
  for (let key = goal; key; key = came.get(key)) {
    const [i, j] = key.split(',').map(Number);
    path.unshift({ x: i * TILE + TILE / 2, y: j * TILE + TILE / 2 });
  }
  return path;
}

/**
 * Click a point and wait for the knight to arrive, re-clicking while it
 * has not — as a player would. A click is one tick's input, and on a
 * loaded machine that tick can reach the server's gate late and be
 * dropped; a single click followed by a bare wait then stalls forever
 * (and every later test, which starts from where this one left the
 * knight, fails with it). Every click in this suite goes through here.
 */
async function clickTo(client, point, reach = 20) {
  let lastClick = 0;
  await until(() => {
    if (distance(client.game.player.position, point) < reach) return true;
    if (Date.now() - lastClick > 300) {
      lastClick = Date.now();
      client.click(point);
    }
    return false;
  });
}

/** Click from cell to cell along a route, the way a player clicks to walk. */
async function walk(client, to, near = 20) {
  for (const waypoint of route(client.game.player.position, to)) await clickTo(client, waypoint, 24);
  await clickTo(client, to, near);
}

describe('Cinder Keep online', () => {
  it('two knights in one keep: each its own, each seeing the other, the solo knight gone', async () => {
    const ann = await join('ann');
    const bob = await join('bob');
    const knights = (client) => [...client.game.entities].filter((e) => e.name === 'Player');
    await until(() => knights(ann).length === 2 && knights(bob).length === 2);
    expect(ann.game.player.playerId).toBe('ann');
    expect(bob.game.player.playerId).toBe('bob');
    expect(knights(ann).every((k) => k.playerId)).toBe(true);
    expect(ann.game.sceneSignature).toBe(bob.game.sceneSignature);

    // Each came in at a spawn point of its own, made from the scene's own
    // knight (its prefab and properties) with no spawn code in the match.
    const spawns = KEEP.layers.flatMap((layer) => layer.objects).filter((o) => o.prefab === 'spawn');
    const at = (knight) => spawns.findIndex((s) => Math.abs(s.x - knight.position.x) <= s.width / 2 && Math.abs(s.y - knight.position.y) <= s.height / 2);
    const [first, second] = knights(ann).sort((a, b) => (a.playerId < b.playerId ? -1 : 1));
    expect(at(first)).toBeGreaterThanOrEqual(0);
    expect(at(second)).toBeGreaterThanOrEqual(0);
    expect(at(first)).not.toBe(at(second));
    for (const knight of knights(bob)) {
      expect(knight.prefab).toBe('player');
      expect(knight.spriteSize).toEqual({ x: 200, y: 200 });
    }
    const matchSource = readFileSync(new URL('../src/iso/keepMatch.js', import.meta.url), 'utf8');
    expect(matchSource).not.toMatch(/\.spawn\(|spawnPrefab|spawnAvatar|setPosition/);
  }, 120000);

  it('a click walks the knight, and the other player watches it go', async () => {
    const [ann, bob] = clients;
    const target = { x: 300, y: 2600 };
    await clickTo(ann, target);
    const seen = bob.game.entityById(ann.game.player.netId);
    await until(() => distance(seen.position, target) < 20);
  }, 120000);

  it('trading needs the quartermaster in reach, and embers in the purse', async () => {
    const [ann] = clients;
    const vendor = [...ann.game.entities].find((e) => e.name === 'Quartermaster');
    expect(await ann.game.players.local.send('buy', { vendor: vendor.netId, ware: 'tonic' })).toEqual({ ok: false, reason: 'not-enough-embers' });
    const [, bob] = clients;
    expect(distance(bob.game.player.position, vendor.position)).toBeGreaterThan(140);
    expect(await bob.game.players.local.send('buy', { vendor: vendor.netId, ware: 'tonic' })).toEqual({ ok: false, reason: 'too-far' });
  }, 120000);

  it('an ember gathered by one knight leaves both views and lands in that knight\'s purse only', async () => {
    const [ann, bob] = clients;
    const embers = () => [...bob.game.entities].filter((e) => e.name === 'Coin');
    const before = embers().length;
    const nearest = embers().sort((a, b) => distance(a.position, ann.game.player.position) - distance(b.position, ann.game.player.position))[0];
    await walk(ann, nearest.position, 30);
    await until(() => !bob.game.entityById(nearest.netId) && !ann.game.entityById(nearest.netId));
    expect(embers().length).toBe(before - 1);
    await until(() => purse(ann.game.players.local).embers === 1);
    expect(purse(bob.game.players.local).embers).toBe(0);
  }, 120000);
});
