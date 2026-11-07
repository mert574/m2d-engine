// Generates a self-signed certificate for the examples dev server, so a
// browser on another machine gets the secure context WebGPU requires.
//
//   node scripts/devCert.mjs            # writes examples/.certs/ if missing or stale
//   node scripts/devCert.mjs --force    # regenerates
//
// The certificate names localhost, every non-internal IPv4 address of this
// machine and its hostname, so the same files serve a LAN address and a local
// one. It is regenerated when that set changes (a new network, a new IP). The
// output directory is ignored by git; nothing here is a secret worth keeping,
// but a certificate is per machine.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { resolve } from 'node:path';

export const certDir = resolve(import.meta.dirname, '..', '.certs');
export const keyPath = resolve(certDir, 'dev.key');
export const certPath = resolve(certDir, 'dev.crt');
const sansPath = resolve(certDir, 'sans.txt');

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function subjectAltNames() {
  const names = new Set(['DNS:localhost', 'IP:127.0.0.1']);
  const host = hostname();
  if (host) names.add(`DNS:${host}`);
  for (const ip of lanAddresses()) names.add(`IP:${ip}`);
  return [...names].join(',');
}

/** Ensures a certificate exists for this machine's current addresses; returns its paths. */
export function ensureDevCert({ force = false, log = console.log } = {}) {
  const sans = subjectAltNames();
  const current = existsSync(sansPath) ? readFileSync(sansPath, 'utf8').trim() : null;
  const fresh = existsSync(keyPath) && existsSync(certPath) && current === sans;
  if (fresh && !force) return { keyPath, certPath, sans };

  mkdirSync(certDir, { recursive: true });
  const args = [
    'req', '-x509', '-nodes', '-days', '825',
    '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-subj', '/CN=m2d dev server',
    '-addext', `subjectAltName=${sans}`,
    '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'extendedKeyUsage=serverAuth',
    '-keyout', keyPath, '-out', certPath
  ];
  try {
    execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) {
    throw new Error(`openssl failed to write a dev certificate (is openssl installed?)\n${error.stderr ?? error.message}`);
  }
  writeFileSync(sansPath, `${sans}\n`);
  log(`Wrote a dev certificate to ${certDir} for ${sans.replaceAll(',', ', ')}`);
  return { keyPath, certPath, sans };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const force = process.argv.includes('--force');
  const { sans } = ensureDevCert({ force });
  if (!force) console.log(`Dev certificate covers ${sans.replaceAll(',', ', ')}`);
}
