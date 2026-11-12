/**
 * A Chrome with the GPU, for whatever needs the editor rendered: the GUI
 * test harness (`scripts/driveEditor.mjs`) and the MCP `screenshot_scene`.
 * The host itself has no GPU; this borrows a browser's.
 *
 * Which Chrome, first that applies:
 * - `M2D_CHROME` — a path to a Chrome or Chromium binary;
 * - under WSL, the Windows Chrome (`C:\Program Files\Google\Chrome`),
 *   which has the real adapter — WSL's own Chromium renders WebGPU in
 *   software or not at all. Needs mirrored networking (`.wslconfig`) so
 *   the two sides share `localhost`;
 * - Playwright's bundled Chromium, which works anywhere and may have no
 *   GPU.
 *
 * Many agents share one machine and one Windows Chrome, so every launch
 * takes a debugging port the OS hands it (read back from the profile) and
 * a profile directory of its own, removed on close. Nothing here attaches
 * to a browser it did not start.
 */

import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium, type Browser } from 'playwright-core';

const WINDOWS_CHROME = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';

/** Whether this is Linux under WSL. */
function isWsl(): boolean {
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

export interface GpuChrome {
  browser: Browser;
  /** Which binary, for logs. */
  binary: string;
  /** Whether it is the Windows side's Chrome. */
  windows: boolean;
  port: number;
  close(): Promise<void>;
}

export interface LaunchOptions {
  /** Show the window (debugging the harness). Default headless. */
  headed?: boolean;
  /** Extra Chrome switches. */
  args?: string[];
}

/**
 * The port Chrome took, from `DevToolsActivePort` in its profile. Asking
 * for port 0 and reading this back is how a launch never collides: a
 * port picked up front can be taken by another agent's Chrome by the
 * time this one binds, and polling it would then find *that* browser and
 * drive (and later close) it.
 */
async function waitForPort(profile: string, child: ChildProcess, ms = 20000): Promise<number | null> {
  const until = Date.now() + ms;
  const file = join(profile, 'DevToolsActivePort');
  while (Date.now() < until) {
    if (child.exitCode !== null) return null;
    try {
      const port = Number((await readFile(file, 'utf8')).split('\n')[0]);
      if (port > 0) return port;
    } catch { /* not written yet */ }
    await new Promise((wait) => setTimeout(wait, 150));
  }
  return null;
}

/** True once the profile is gone; it is locked while its Chrome runs, and briefly after. */
async function removeProfile(profile: string): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    try {
      await rm(profile, { recursive: true, force: true });
      return true;
    } catch {
      await new Promise((wait) => setTimeout(wait, 300));
    }
  }
  return false;
}

/** The last resort: a Windows chrome.exe that survived Browser.close, found by this launch's unique tag. */
function killWindowsChromeBy(tag: string): void {
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match '${tag}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
    ], { stdio: 'ignore', timeout: 15000 });
  } catch { /* nothing left to kill, or no PowerShell */ }
}

/**
 * Start a Chrome with the GPU on a port of its own and its own profile, and
 * connect Playwright to it over CDP.
 */
export async function launchGpuChrome(options: LaunchOptions = {}): Promise<GpuChrome> {
  const configured = process.env.M2D_CHROME;
  const windows = !configured && isWsl() && existsSync(WINDOWS_CHROME);
  const binary = configured ?? (windows ? WINDOWS_CHROME : chromium.executablePath());
  const switches = [
    ...(options.headed ? [] : ['--headless=new']),
    '--enable-gpu',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--window-size=1600,1000',
    ...(options.args ?? [])
  ];

  // A profile of our own, removed on close. The Windows Chrome needs a
  // Windows path; Linux reaches it under /mnt.
  const tag = `m2d-chrome-${process.pid}-${randomBytes(4).toString('hex')}`;
  let profile: string;
  let profileHere: string;
  if (windows) {
    const temp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    profile = `${temp}\\${tag}`;
    profileHere = execFileSync('wslpath', ['-u', profile], { encoding: 'utf8' }).trim();
  } else {
    profileHere = await mkdtemp(join(tmpdir(), `${tag}-`));
    profile = profileHere;
  }

  let output = '';
  let spawnError = '';
  const child = spawn(binary, [...switches, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (chunk) => { output = (output + String(chunk)).slice(-2000); });
  child.stderr?.on('data', (chunk) => { output = (output + String(chunk)).slice(-2000); });
  child.on('error', (error) => { spawnError = error.message; });
  const port = await waitForPort(profileHere, child);
  if (!port) {
    child.kill();
    if (!(await removeProfile(profileHere)) && windows) {
      killWindowsChromeBy(tag);
      await removeProfile(profileHere);
    }
    throw new Error(`could not start Chrome (${binary}): ${spawnError || output.trim().split('\n').slice(-3).join(' ') || 'it never opened a DevTools port'}`);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  // Whoever ends this process must not orphan the browser: Vite, for one,
  // installs its own SIGTERM handler that exits as soon as its server has
  // closed, and an async close loses that race. Exit handlers may only do
  // synchronous work, which is also why `close` below exists separately.
  const reap = () => {
    if (windows) killWindowsChromeBy(tag);
    else child.kill('SIGKILL');
    try { rmSync(profileHere, { recursive: true, force: true }); } catch { /* still locked; the browser at least is dead */ }
  };
  process.once('exit', reap);
  let closed = false;
  return {
    browser, binary, windows, port,
    async close() {
      if (closed) return;
      closed = true;
      // CDP's Browser.close is the one way that reliably ends a Windows
      // chrome.exe from WSL: child.kill() only reaches the interop proxy,
      // and the browser would outlive it. So give it time.
      await Promise.race([
        browser.newBrowserCDPSession().then((cdp) => cdp.send('Browser.close')).catch(() => {}),
        new Promise((wait) => setTimeout(wait, 15000))
      ]);
      await browser.close().catch(() => {});
      child.kill();
      // Chrome holds the profile while it runs, so removal doubles as the
      // proof of death. A profile that outlives the retries means a browser
      // that did too: end it by the tag only its command line carries.
      if (!(await removeProfile(profileHere))) {
        if (windows) killWindowsChromeBy(tag);
        await new Promise((wait) => setTimeout(wait, 1000));
        await removeProfile(profileHere);
      }
      process.off('exit', reap);
    }
  };
}

/** The adapter a page sees, for a log line: who draws, or why nothing will. */
export async function describeAdapter(page: import('playwright-core').Page): Promise<string> {
  return page.evaluate(async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; description?: string } } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    if (!adapter) return 'no WebGPU adapter (2D still draws on WebGL2; 3D will not)';
    const info = adapter.info ?? {};
    return `WebGPU on ${[info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'an unnamed adapter'}`;
  });
}
