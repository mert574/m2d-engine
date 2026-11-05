/**
 * Console commands: the verbs next to the cvars' nouns.
 *
 * A command is a name, a one-line description and a `run(args, io)`. The
 * `io` the console hands in has `print`/`warn`/`error`, so a command's
 * output lands in the scrollback it was typed into rather than the browser
 * console.
 *
 * ## One input line, Source's grammar
 *
 * `execute` resolves a line the way Quake-family consoles do, because that
 * grammar is pure muscle memory for anyone who opens a console at all:
 *
 *   help                 a command runs
 *   cl_showfps           a bare cvar prints its value
 *   cl_showfps 0         a cvar followed by a value sets it
 *
 * Commands win a name collision with cvars, which cannot happen anyway
 * while both follow the naming conventions.
 */

/**
 * Split a line into arguments, honouring double quotes, so
 * `echo "two words"` is two tokens: `echo` and `two words`.
 * @param {string} line
 * @returns {string[]}
 */
export function tokenize(line) {
  const out = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    out.push(match[1] ?? match[2]);
  }
  return out;
}

export class CommandRegistry {
  /**
   * @param {import('./cvars.js').CVarRegistry} cvars - For the cvar half of
   *   the grammar, and for `set`/`toggle`/`reset`/`find`
   */
  constructor(cvars) {
    this.cvars = cvars;
    /** @type {Map<string, {name: string, description: string, usage: string, run: Function}>} */
    this.commands = new Map();
  }

  /**
   * Register a command.
   * @param {string} name
   * @param {Object} definition
   * @param {string} [definition.description]
   * @param {string} [definition.usage] - Shown by `help <name>`
   * @param {(args: string[], io: object) => void} definition.run
   */
  register(name, definition) {
    if (this.commands.has(name)) throw new Error(`command '${name}' is already registered`);
    this.commands.set(name, {
      name,
      description: definition.description ?? '',
      usage: definition.usage ?? name,
      run: definition.run
    });
  }

  has(name) {
    return this.commands.has(name);
  }

  /** Names, sorted, optionally filtered like `CVarRegistry.list`. */
  list(filter = '') {
    const needle = filter.toLowerCase();
    return [...this.commands.keys()]
      .filter((name) => {
        if (!needle) return true;
        const entry = this.commands.get(name);
        return name.toLowerCase().includes(needle) ||
          entry.description.toLowerCase().includes(needle);
      })
      .sort();
  }

  /**
   * Run one input line.
   * @param {string} line
   * @param {{print: Function, warn: Function, error: Function}} io
   */
  execute(line, io) {
    const [name, ...args] = tokenize(line);
    if (!name) return;

    const command = this.commands.get(name);
    if (command) {
      try {
        command.run(args, io);
      } catch (error) {
        io.error(String(error?.message ?? error));
      }
      return;
    }

    if (this.cvars.has(name)) {
      try {
        if (args.length === 0) {
          const entry = this.cvars.describe(name);
          io.print(`${name} = ${format(this.cvars.get(name))}` +
            (entry.description ? `  — ${entry.description}` : ''));
        } else {
          const value = this.cvars.set(name, args.join(' '));
          io.print(`${name} = ${format(value)}`);
        }
      } catch (error) {
        io.error(String(error?.message ?? error));
      }
      return;
    }

    io.error(`unknown command '${name}' — try 'help' or 'find ${name}'`);
  }

  /**
   * Completions for a partial first token: commands and cvars that extend
   * it, sorted. For a later token there is nothing general to offer.
   * @param {string} line
   * @returns {{completions: string[], prefix: string}}
   */
  complete(line) {
    const tokens = tokenize(line);
    const atFirstWord = tokens.length <= 1 && !line.endsWith(' ');
    if (!atFirstWord) {
      // Completing a value: offer a string cvar's choices.
      const [name] = tokens;
      const entry = this.cvars.describe(name ?? '');
      if (entry?.choices) {
        const partial = tokens[1] ?? '';
        return {
          completions: entry.choices.filter((choice) => choice.startsWith(partial)),
          prefix: partial
        };
      }
      return { completions: [], prefix: '' };
    }

    const prefix = tokens[0] ?? '';
    const names = [
      ...this.list().filter((name) => name.startsWith(prefix)),
      ...this.cvars.list().filter((name) => name.startsWith(prefix))
    ].sort();
    return { completions: names, prefix };
  }
}

/**
 * Register the commands every game gets.
 * @param {CommandRegistry} commands
 * @param {import('../m2d.js').M2D} game
 */
export function registerBuiltins(commands, game) {
  const cvars = commands.cvars;

  commands.register('help', {
    description: 'List commands, or explain one',
    usage: 'help [name]',
    run(args, io) {
      if (args[0]) {
        const command = commands.commands.get(args[0]);
        const cvar = cvars.describe(args[0]);
        if (command) io.print(`${command.usage}  — ${command.description}`);
        else if (cvar) io.print(describeCvar(cvar, cvars));
        else io.error(`no command or cvar named '${args[0]}'`);
        return;
      }
      io.print('commands: ' + commands.list().join(', '));
      io.print("cvars: type 'cvars' to list, '<name>' to read, '<name> <value>' to set");
    }
  });

  commands.register('net', {
    description: 'The connection: who, how fast, how far behind and how often corrected',
    usage: 'net',
    run(args, io) {
      const net = game.net;
      if (!net) {
        io.print('not connected. A game plays online by connecting with NetClient.connect; see docs/guide/multiplayer');
        return;
      }
      const stats = net.stats;
      const view = net.view;
      const predictor = net.predictor;
      const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
      io.print(`player      ${net.you}`);
      io.print(`state       ${net.closed ? `closed (${net.closed.code} ${net.closed.reason || ''})` : net.open ? 'open' : 'closing'}`);
      io.print(`tick        server ${net.serverTick} · ${net.tickRate} Hz · state every ${net.sendEvery} tick(s)`);
      io.print(`rtt         ${Math.round(net.rtt)} ms`);
      io.print(`lead        ${net.lead} ticks · input arrived ${net.gate.margin ?? '—'} ticks early`);
      io.print(`gate        ${net.gate.late} late · ${net.gate.missed} missed · ${net.gate.early} early`);
      io.print(`drawing     ${view ? `${view.delay} ticks behind (${view.extraDelay} extra) · render tick ${view.renderTick === null ? '—' : view.renderTick.toFixed(1)}` : '—'}`);
      io.print(`tracks      ${view ? view.tracks.size : 0} entities interpolated`);
      io.print(`prediction  ${predictor ? (predictor.entity ? `on, entity #${predictor.entity.netId}` : 'on, nothing to predict') : 'off'}`);
      if (predictor) {
        io.print(`corrections ${predictor.corrections} · last ${predictor.lastError.toFixed(2)} px · history ${predictor.history.size} ticks`);
      }
      io.print(`traffic     in ${kb(stats.bytesIn)} (${(stats.inRate / 1024).toFixed(1)} KB/s) · out ${kb(stats.bytesOut)} (${(stats.outRate / 1024).toFixed(1)} KB/s)`);
      io.print(`messages    ${stats.messagesIn} in · ${stats.messagesOut} out · ${stats.hidden} hidden by interest`);
      void args;
    }
  });

  commands.register('find', {
    description: 'Search commands and cvars by name or description',
    usage: 'find <text>',
    run(args, io) {
      const needle = args.join(' ');
      if (!needle) return io.error('find what?');
      const hits = [
        ...commands.list(needle).map((name) => `${name}  — ${commands.commands.get(name).description}`),
        ...cvars.list(needle).map((name) => describeCvar(cvars.describe(name), cvars))
      ];
      if (hits.length === 0) return io.print(`nothing matches '${needle}'`);
      for (const hit of hits) io.print(hit);
    }
  });

  commands.register('cvars', {
    description: 'List every cvar and its current value',
    usage: 'cvars [filter]',
    run(args, io) {
      for (const name of cvars.list(args.join(' '))) {
        io.print(describeCvar(cvars.describe(name), cvars));
      }
    }
  });

  commands.register('set', {
    description: 'Set a cvar (same as typing the cvar and a value)',
    usage: 'set <cvar> <value>',
    run(args, io) {
      if (args.length < 2) return io.error('usage: set <cvar> <value>');
      const value = cvars.set(args[0], args.slice(1).join(' '));
      io.print(`${args[0]} = ${format(value)}`);
    }
  });

  commands.register('toggle', {
    description: 'Flip a boolean cvar',
    usage: 'toggle <cvar>',
    run(args, io) {
      if (!args[0]) return io.error('usage: toggle <cvar>');
      io.print(`${args[0]} = ${format(cvars.toggle(args[0]))}`);
    }
  });

  commands.register('reset', {
    description: 'Return a cvar to its default',
    usage: 'reset <cvar>',
    run(args, io) {
      if (!args[0]) return io.error('usage: reset <cvar>');
      io.print(`${args[0]} = ${format(cvars.reset(args[0]))}`);
    }
  });

  commands.register('echo', {
    description: 'Print its arguments',
    usage: 'echo <text>',
    run(args, io) {
      io.print(args.join(' '));
    }
  });

  commands.register('clear', {
    description: 'Clear the scrollback',
    run(_args, io) {
      io.clear?.();
    }
  });

  commands.register('noclip', {
    description: "Toggle the player's collisions off, so it walks through walls (and, in a game that honours entity.noclip, flies)",
    usage: 'noclip',
    run(_args, io) {
      const player = game.player;
      if (!player) return io.error('no player entity');
      const on = !player.noclip;
      player.noclip = on;
      if (on) {
        player.noclipMask = player.body.collisionFilter.mask;
        player.body.setCollisionFilter({ mask: 0 });
      } else {
        player.body.setCollisionFilter({ mask: player.noclipMask ?? 0xFFFF });
      }
      io.print(`noclip ${on ? 'on' : 'off'}`);
    }
  });

  commands.register('scenes', {
    description: 'List registered scenes',
    run(_args, io) {
      const manager = game.sceneManager;
      const loaded = [...manager.scenes.keys()];
      const pending = manager.scenesToLoad.map((scene) => scene.name);
      const current = manager.getCurrentScene()?.config?.name;
      for (const name of [...new Set([...loaded, ...pending])].sort()) {
        io.print(`${name === current ? '> ' : '  '}${name}`);
      }
    }
  });

  commands.register('scene', {
    description: 'Switch to a scene',
    usage: 'scene <name>',
    run(args, io) {
      if (!args[0]) return io.error('usage: scene <name>');
      game.sceneManager.switchTo(args[0])
        .then(() => io.print(`switched to '${args[0]}'`))
        .catch((error) => io.error(String(error?.message ?? error)));
    }
  });

  commands.register('entities', {
    description: 'Count the live entities, by actor',
    run(_args, io) {
      const counts = new Map();
      for (const entity of game.entities) {
        const key = entity.constructor?.name ?? 'Entity';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (counts.size === 0) return io.print('no entities');
      for (const [key, count] of [...counts].sort()) io.print(`${count}  ${key}`);
    }
  });
}

function describeCvar(entry, cvars) {
  const range = entry.type === 'number' && (entry.min !== undefined || entry.max !== undefined)
    ? ` [${entry.min ?? ''}..${entry.max ?? ''}]`
    : entry.choices ? ` (${entry.choices.join('|')})` : '';
  return `${entry.name} = ${format(cvars.get(entry.name))}${range}` +
    (entry.description ? `  — ${entry.description}` : '');
}

function format(value) {
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}
