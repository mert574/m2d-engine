import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { simulate } from '../src/scroller/simulate.mjs';

/**
 * Beeline's game.js is what a server would run. It has to load in plain
 * Node, with no DOM and none of Vite's import extensions, and the lane it
 * simulates must be a function of its input.
 */
describe('Beeline headless', () => {
  it('flies the lane from a client input stream, the same every time', async () => {
    const first = await simulate({ ticks: 600 });
    const second = await simulate({ ticks: 600 });
    expect(second).toEqual(first);
    expect(first.ticks).toBe(600);
    expect(first.bee.x).toBeGreaterThan(1000);
    expect(first.bee.pollen).toBeGreaterThan(0);
    expect(first.gate.missed).toBe(0);
  });

  it('runs as a plain node process, and agrees with this one', async () => {
    const script = fileURLToPath(new URL('../src/scroller/simulate.mjs', import.meta.url));
    const stdout = execFileSync(process.execPath, [script, '600'], { encoding: 'utf8', timeout: 60000 });
    const line = stdout.split('\n').find((l) => l.startsWith('RESULT '));
    expect(JSON.parse(line.slice('RESULT '.length))).toEqual(await simulate({ ticks: 600 }));
  });
});
