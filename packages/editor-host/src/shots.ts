/**
 * Agent vision: the MCP `screenshot_scene`. The host has no GPU, so it
 * opens its own editor in a Chrome that does (`chrome.ts`) and grabs the
 * viewport. That tab is an editor tab like any other, so it shows the
 * open document as the host holds it, unsaved edits included — what an
 * agent just edited, drawn by the real renderer.
 *
 * One Chrome and one tab, started on the first call and closed after a
 * few idle minutes or with the host. Calls take turns.
 */

import type { Page } from 'playwright-core';
import { describeAdapter, launchGpuChrome, type GpuChrome } from './chrome.ts';

export interface ShotOptions {
  /** The scene's path in the project. */
  path: string;
  /** Play it for this many seconds first (no input) and shoot the running game. 0: the edit view. */
  play?: number;
  /** Frame this object (by id) before the shot, as F does. */
  focus?: string;
  /** `scene`: the viewport's canvas alone. `editor`: the whole window, panels and gizmos. */
  view?: 'scene' | 'editor';
  width?: number;
  height?: number;
}

export interface Shot {
  png: Buffer;
  /** What the tab said about it: the adapter, the scene, anything it logged as an error. */
  notes: string[];
}

const IDLE_MS = 5 * 60 * 1000;

interface EditorHook {
  openScene(path: string): Promise<void>;
  idle(): Promise<void>;
  togglePlay(): void;
  readonly playing: boolean;
  readonly loadError: string | null;
  readonly scenePath: string | null;
  viewport: { frame(id: string): void; placement(id: string): unknown };
}
type Hooked = { m2dEditor?: EditorHook };

export class SceneCamera {
  #url: string;
  #chrome: Promise<GpuChrome> | null = null;
  #page: Page | null = null;
  #adapter = '';
  #errors: string[] = [];
  #turn: Promise<unknown> = Promise.resolve();
  #idle: ReturnType<typeof setTimeout> | null = null;

  /** @param url - This host's editor, e.g. `http://localhost:41234/` */
  constructor(url: string) {
    this.#url = url;
  }

  shoot(options: ShotOptions): Promise<Shot> {
    const run = this.#turn.then(() => this.#shoot(options));
    this.#turn = run.catch(() => {});
    return run;
  }

  async close(): Promise<void> {
    if (this.#idle) clearTimeout(this.#idle);
    this.#idle = null;
    const chrome = this.#chrome;
    this.#chrome = null;
    this.#page = null;
    if (chrome) await (await chrome.catch(() => null))?.close();
  }

  async #tab(): Promise<Page> {
    if (this.#page && !this.#page.isClosed()) return this.#page;
    this.#chrome ??= launchGpuChrome();
    let chrome: GpuChrome;
    try {
      chrome = await this.#chrome;
    } catch (error) {
      this.#chrome = null;
      throw error;
    }
    const context = await chrome.browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => { this.#errors.push(error.message.slice(0, 300)); });
    page.on('console', (message) => { if (message.type() === 'error') this.#errors.push(message.text().slice(0, 300)); });
    // A tab that dies (GPU reset, out of memory) is abandoned; the next
    // shot gets a fresh one in the same browser.
    page.once('crash', () => {
      this.#page = null;
      void page.context().close().catch(() => {});
    });
    await page.goto(this.#url);
    await page.waitForFunction(() => (globalThis as unknown as Hooked).m2dEditor, undefined, { timeout: 60000 });
    this.#adapter = await describeAdapter(page);
    this.#page = page;
    return page;
  }

  async #shoot(options: ShotOptions): Promise<Shot> {
    if (this.#idle) clearTimeout(this.#idle);
    try {
      const page = await this.#tab();
      this.#errors = [];
      await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 800 });
      // Whatever the last shot left playing stops first.
      await page.evaluate(async () => {
        const editor = (globalThis as unknown as Hooked).m2dEditor!;
        await editor.idle();
        if (editor.playing) { editor.togglePlay(); await editor.idle(); }
      });
      const failed = await page.evaluate(async (path) => {
        const editor = (globalThis as unknown as Hooked).m2dEditor!;
        await editor.openScene(path);
        return editor.loadError;
      }, options.path);
      if (failed) throw new Error(`${options.path} did not load: ${failed}`);
      const notes = [this.#adapter, options.path];
      if (options.focus) {
        const found = await page.evaluate((id) => {
          const editor = (globalThis as unknown as Hooked).m2dEditor!;
          if (!editor.viewport.placement(id)) return false;
          editor.viewport.frame(id);
          return true;
        }, options.focus);
        notes.push(found ? `framed ${options.focus}` : `no object '${options.focus}' on screen; not framed`);
      }
      if (options.play) {
        await page.evaluate(async () => {
          const editor = (globalThis as unknown as Hooked).m2dEditor!;
          editor.togglePlay();
          await editor.idle();
        });
        const playing = await page.evaluate(() => (globalThis as unknown as Hooked).m2dEditor!.playing);
        if (!playing) throw new Error('play did not start; the game probably threw on load (see errors)');
        await page.waitForTimeout(options.play * 1000);
        notes.push(`after ${options.play}s of play`);
      } else {
        // A few frames for streaming textures and the post stack to settle.
        await page.waitForTimeout(700);
      }
      const png = options.view === 'editor'
        ? await page.screenshot()
        : await page.locator('#screen').screenshot();
      if (options.play) {
        await page.evaluate(async () => {
          const editor = (globalThis as unknown as Hooked).m2dEditor!;
          if (editor.playing) { editor.togglePlay(); await editor.idle(); }
        });
      }
      if (this.#errors.length) notes.push(`errors: ${[...new Set(this.#errors)].slice(0, 5).join(' | ')}`);
      return { png, notes };
    } finally {
      this.#idle = setTimeout(() => { void this.close(); }, IDLE_MS);
      this.#idle.unref?.();
    }
  }
}
