#!/usr/bin/env node
/**
 * One model compile in a process of its own: `node compileJob.mjs '<json>'`.
 *
 * A scan being decimated holds gigabytes and the encoder runs long
 * stretches without yielding; in the host's own process that would stall
 * every request and socket the editor depends on. The result goes to
 * stdout as one JSON line; anything else the stack prints goes to stderr.
 */
import { compileModel } from './compile.mjs';

const log = console.log;
console.log = (...args) => console.error(...args);
try {
  const result = await compileModel(JSON.parse(process.argv[2]));
  log(JSON.stringify({ ok: true, result }));
} catch (error) {
  log(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
  process.exitCode = 1;
}
