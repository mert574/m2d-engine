# Developer console

A Source-style drop-down console over two registries: **cvars** (named, typed engine state) and **commands** (verbs). It opens with backquote, completes with Tab, keeps history on the arrows, and mirrors the engine's own `console.*` logs so a failed sprite load is readable in-game.

```
> help
> cl_showfps 0
> g_timescale 0.25
> scene level1
```

The grammar is Quake's: a known command runs; a bare cvar prints its value; a cvar followed by a value sets it.

## CVars — `game.cvars`

From `core/console/cvars.js`. A cvar is a name, a type, a way to read, a way to write and a description — the wiring every settings surface needs, done once. The settings menu is a view onto this registry.

```javascript
game.cvars.register('g_difficulty', {
  type: 'string',
  choices: ['easy', 'normal', 'hard'],
  default: 'normal',
  persist: true,
  description: 'Enemy aggression and damage',
  onChange: (value) => applyDifficulty(value)
});
```

| Field | Meaning |
| --- | --- |
| `type` | `'number'`, `'boolean'` or `'string'` |
| `default` | Required unless `get` is given |
| `get`, `set` | Accessors over live engine state, so the cvar asks the engine rather than keeping a copy that can drift. `get` without `set` is read-only |
| `min`, `max` | Clamp for numbers |
| `choices` | Allowed values for strings |
| `persist` | Save to localStorage on change and replay at registration, scoped by the `saveId` engine option (default: the page's pathname). A stored value that no longer parses is dropped rather than left to wedge startup |
| `onChange(value, previous)` | Fires only when the value actually changes |
| `description` | One line for `help` and `find` |

| Method | Meaning |
| --- | --- |
| `get(name)`, `set(name, value)` | Writes go through parsing, clamping and choice-checking, so a console typo cannot produce a state no menu could |
| `toggle(name)` | Booleans only |
| `reset(name)` | Back to the default |
| `list(filter)` | Names, sorted, filtered over name *and* description |
| `describe(name)`, `has(name)` | |

Boolean spellings accepted: `1/0`, `on/off`, `true/false`, `yes/no`.

### Engine cvars

Prefixes follow the Quake convention the completion is built around: `r_` render, `g_` game, `cl_` client-side presentation.

| Name | Type | Persists | Meaning |
| --- | --- | --- | --- |
| `r_resolution` | string | yes | `native`, a scale (`0.5`), or `WxH` (`960x540`) |
| `r_aspect` | `letterbox\|expand` | yes | |
| `r_worldfilter` | `linear\|nearest` | yes | |
| `r_fullscreen` | boolean | | |
| `r_debug` | boolean | | The renderer's debug overlay |
| `r_renderer` | `webgl\|canvas` | | Setting it reloads with `?renderer=` |
| `g_paused` | boolean | | |
| `g_timescale` | number 0–10 | | `game.time.scale`. `0.5` is slow motion |
| `cl_showfps` | boolean | yes | The frame-rate readout |
| `cl_statsexpanded` | boolean | yes | The readout's full counter list (F3) |

## Commands — `game.commands`

From `core/console/commands.js`.

```javascript
game.commands.register('give', {
  description: 'Grant an item to the player',
  usage: 'give <item> [count]',
  run(args, io) {
    const [item, count = '1'] = args;
    if (!item) return io.error('usage: give <item> [count]');
    inventory.add(item, Number(count));
    io.print(`gave ${count} ${item}`);
  }
});
```

`io` has `print`, `warn`, `error` and `clear`, so a command's output lands in the scrollback it was typed into. A command that throws is reported as an error line, not a crash. Arguments are split on whitespace with double quotes honoured (`echo "two words"`).

Built-ins: `help [name]`, `find <text>`, `cvars [filter]`, `set`, `toggle`, `reset`, `echo`, `clear`, `scene <name>`, `scenes`, `entities`.

`execute(line, io)` runs one line; `complete(line)` returns completions for the first token across commands and cvars together, or a string cvar's `choices` for its value.

## The console itself — `game.console`

From `core/console/devConsole.js`. Mounted unless the `devConsole` engine option is `false`; the registries exist either way.

| Key | Effect |
| --- | --- |
| ` (backquote) | Open / close. Configurable via the `hotkey` option |
| Enter | Run the line |
| Tab | Complete. One match completes outright; several extend to the common prefix and print the choices |
| ↑ / ↓ | History, keeping the line being typed |
| ←/→, Home, End, Backspace, Delete | Edit |
| PageUp / PageDown, wheel | Scroll the scrollback |
| Escape | Close |

While open it captures **every key** — it sits in `game.ui.debug` with `captureAll`, routed before any screen — but it is not modal: pointer input outside its panel falls through, so the game and its menus stay clickable underneath. Key releases still reach the game, so a key held when it opened does not stick. Because the engine suppresses the browser default of any key it consumes, typing in the console cannot scroll the page or trigger find-in-page.

Typing reads `event.key` — the character the player's layout produced — which is the engine's one sanctioned use of layout-dependent input; game bindings stay on physical `event.code`.

`game.console.execute('...')` scripts it; `append(text, kind)` writes a line (`kinds: 'print' | 'warn' | 'error' | 'debug' | 'input'`).

### console.* capture

While mounted, the global `console.log/info/debug/warn/error` are wrapped (and forwarded), so engine warnings land in the scrollback. The first mounted console on a page wins; `destroy()` restores the originals. Pass `captureConsole: false` to leave the globals alone.
