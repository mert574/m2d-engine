/**
 * The console: the dock's Console tab.
 *
 * What the game says — `console.log`, `warn`, `error` from its code and
 * the engine's, and anything thrown and not caught — lands here rather
 * than only in the browser's devtools, repeats folded into a count. The
 * line at the bottom runs the engine's console commands and cvars
 * (`help`, `find`, `noclip`, any `game.commands` a game registers)
 * against whichever game is live: the edited scene, or the one being
 * played. The engine's own in-canvas console stays off in the editor;
 * this is it, in the chrome.
 */

export interface ConsoleHandle {
  /** Something the editor itself wants said, in the same list. */
  print(text: string, level?: Level): void;
  clear(): void;
  /** How many errors and warnings arrived since the last look. */
  readonly unseen: number;
  seen(): void;
}

type Level = 'log' | 'info' | 'warn' | 'error' | 'input';

interface CommandGame {
  commands?: {
    execute(line: string, io: { print(text: string): void; warn(text: string): void; error(text: string): void }): void;
    complete?(line: string): { completions: string[] };
  };
}

const LIMIT = 500;

export function createConsolePanel(container: HTMLElement, game: () => CommandGame | null, onUnseen: (count: number) => void): ConsoleHandle {
  container.replaceChildren();
  container.classList.add('console-pane');
  const list = document.createElement('ol');
  list.className = 'console-lines';
  const form = document.createElement('form');
  form.className = 'console-input';
  const prompt = document.createElement('span');
  prompt.textContent = '›';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'help · find <text> · a cvar or command';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Console command');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'mini';
  clear.textContent = 'Clear';
  form.append(prompt, input, clear);
  container.append(list, form);

  let unseen = 0;
  let last: { key: string; element: HTMLElement; count: number } | null = null;
  const history: string[] = [];
  let historyAt = -1;

  const add = (text: string, level: Level) => {
    const key = `${level}:${text}`;
    if (last && last.key === key) {
      last.count++;
      let badge = last.element.querySelector('.repeat');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'repeat';
        last.element.prepend(badge);
      }
      badge.textContent = String(last.count);
      return;
    }
    const item = document.createElement('li');
    item.className = `line ${level}`;
    item.textContent = text;
    list.append(item);
    last = { key, element: item, count: 1 };
    while (list.children.length > LIMIT) list.firstElementChild?.remove();
    if (level === 'error' || level === 'warn') {
      unseen++;
      onUnseen(unseen);
    }
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    if (nearBottom) list.scrollTop = list.scrollHeight;
  };

  const text = (args: unknown[]) => args.map((arg) => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack ?? arg.message;
    try { return JSON.stringify(arg); } catch { return String(arg); }
  }).join(' ');

  // The page's console, mirrored: the browser's devtools still get every
  // line, the dock gets them too. `debug` stays in devtools only — the
  // engine narrates every entity it creates there.
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      add(text(args), level);
    };
  }
  window.addEventListener('error', (event) => add(`Uncaught ${event.error?.stack ?? event.message}`, 'error'));
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { stack?: string; message?: string } | undefined;
    add(`Unhandled rejection: ${reason?.stack ?? reason?.message ?? String(event.reason)}`, 'error');
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const line = input.value.trim();
    if (!line) return;
    input.value = '';
    history.push(line);
    historyAt = -1;
    add(`> ${line}`, 'input');
    const live = game();
    if (!live?.commands) {
      add('no game is running to take commands', 'warn');
      return;
    }
    live.commands.execute(line, {
      print: (out) => add(out, 'log'),
      warn: (out) => add(out, 'warn'),
      error: (out) => add(out, 'error')
    });
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' && history.length) {
      historyAt = historyAt < 0 ? history.length - 1 : Math.max(0, historyAt - 1);
      input.value = history[historyAt]!;
      event.preventDefault();
    } else if (event.key === 'ArrowDown' && historyAt >= 0) {
      historyAt = historyAt + 1 >= history.length ? -1 : historyAt + 1;
      input.value = historyAt < 0 ? '' : history[historyAt]!;
      event.preventDefault();
    } else if (event.key === 'Tab') {
      const done = game()?.commands?.complete?.(input.value);
      if (done?.completions.length === 1) input.value = `${done.completions[0]} `;
      else if (done?.completions.length) add(done.completions.join('  '), 'info');
      event.preventDefault();
    }
  });
  clear.addEventListener('click', () => {
    list.replaceChildren();
    last = null;
  });

  return {
    print: (message, level = 'info') => add(message, level),
    clear() { list.replaceChildren(); last = null; },
    get unseen() { return unseen; },
    seen() { unseen = 0; onUnseen(0); }
  };
}
