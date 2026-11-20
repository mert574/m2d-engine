// The TypeScript conversion's ratchet (knowledge-base/projects/types).
//
// Two counts per workspace — explicit `any` (oxlint's
// `typescript/no-explicit-any`) and JavaScript files still in git — held
// against `types-baseline.json`. A count above its baseline fails: debt
// was added. A count below its baseline fails too, until the baseline is
// lowered with `--update`, so a gain is locked in by the change that made
// it rather than spent by the next one.
//
//   node scripts/typesRatchet.ts            check (what `npm test` runs)
//   node scripts/typesRatchet.ts --update   write the current counts
//
// The conversion is finished when every count is zero; the baseline file
// and this script are then deleted and the lint rule becomes an error.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Counts = { any: number; js: number };
type Baseline = Record<string, Counts>;

const root = fileURLToPath(new URL('..', import.meta.url));
const baselineFile = `${root}types-baseline.json`;

/** Vendored third-party code, which is never converted. */
const VENDORED = ['packages/engine/src/core/renderers/webgpu/basis/'];

/** `packages/<name>`, a top-level folder, or `(root)` for a file at the root. */
function workspaceOf(file: string): string {
  const parts = file.split('/');
  if (parts.length === 1) return '(root)';
  return parts[0] === 'packages' ? `packages/${parts[1]}` : String(parts[0]);
}

function count(): Baseline {
  const counts: Baseline = {};
  const bump = (file: string, key: keyof Counts) => {
    const entry = (counts[workspaceOf(file)] ??= { any: 0, js: 0 });
    entry[key]++;
  };

  const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => /\.(m?js|cjs)$/.test(file) && !VENDORED.some((dir) => file.startsWith(dir)));
  for (const file of tracked) bump(file, 'js');

  const lint = execFileSync(process.execPath, [`${root}node_modules/oxlint/bin/oxlint`, '-f', 'json', '.'], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  const { diagnostics } = JSON.parse(lint) as { diagnostics: Array<{ code: string; filename: string }> };
  for (const { code, filename } of diagnostics) {
    if (code === 'typescript(no-explicit-any)') bump(filename, 'any');
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

const current = count();

if (process.argv.includes('--update')) {
  writeFileSync(baselineFile, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`types-baseline.json: ${Object.entries(current).map(([ws, c]) => `${ws} ${c.any}/${c.js}`).join(', ')}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Baseline;
const problems: string[] = [];
for (const ws of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
  for (const key of ['any', 'js'] as const) {
    const was = baseline[ws]?.[key] ?? 0;
    const now = current[ws]?.[key] ?? 0;
    const what = key === 'any' ? 'explicit `any`' : 'JavaScript files';
    if (now > was) problems.push(`${ws}: ${now} ${what}, up from ${was}. New code is TypeScript with real types.`);
    if (now < was) problems.push(`${ws}: ${now} ${what}, down from ${was}. Lock the gain in: node scripts/typesRatchet.ts --update`);
  }
}
if (problems.length) {
  console.error(`types ratchet:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
