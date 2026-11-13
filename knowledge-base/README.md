# Knowledge base

The repository's memory — the only one an agent has, and the place to write anything worth keeping. It holds decisions, learnings and working preferences, plus the plans and records of big projects. It is not documentation (that is `docs/`) and not a work log (that is git). It works as an Obsidian vault: notes link with `[[note-name]]`, and file names are unique across the folder so every link resolves.

## Map

- Notes:
  - [[idiomatic-m2d]]: how games are written on m2d;
  - [[code-style]]: rules for code itself;
  - [[demo-standards]]: quality, art direction, menus, assets;
  - [[working-style]]: worktrees, GPU checks, MCP parity, commits, where things live.
- Projects:
  - [[editor]], with the active [[idiomatic-examples]];
  - [[networking]];
  - [[3d]].

## Layout

- `notes/<topic>.md`: one file per topic, holding every durable decision and learning about it.
- `projects/<project>/<project>.md`: a big piece of work's entry point (decisions, plan, backlog, record). Sub-plans sit beside it. The roadmap gives each project one line.

## Rules

- **Brief and complete.** A topic's knowledge lives in one note, written tightly. Someone reading that note should get the whole topic without gathering it from other files.
- **No redundancy.** Each fact is stated once, in the note it belongs to. Other notes link to it instead of restating it.
- **Topics, not fragments.** Add to an existing note when the fact belongs to its topic. Start a new note only for a topic that is related to the others but distinct from them. Split a note only when it grows two topics.
- **No orphans.** Every file is linked from at least one other file, and this map reaches every note and project. A new file adds its links, and its line in the `AGENTS.md` index, in the same change.
- **Durable only.** Notes hold what stays true. In-progress state and task lists belong in a project's plan.
- **Correct in place.** When something turns out to be wrong, fix the note rather than appending a contradiction.

## Keeping it current

The knowledge base is read *and* written. A stale entry is worse than a missing one, because it is trusted.

- **When it falls short, fill the gap.** If you needed something, couldn't find it here, and then worked it out, record it.
- **Decisions change with the code.** When a decision changes, update or remove the entry in the same change as the code. Never leave a superseded rule standing.
- **Record what matters.** That means owner feedback, decisions, and lessons another agent would otherwise repeat. Skip trivia, anything the code or git already makes plain, and one-off details.
- **At the end of every big session** (for example, finishing a project's phases), extract the session's learnings and record the finished phases in the project.

**Scope.** Judge from context how far each item reaches:

| Scope | Examples | Where it goes |
| --- | --- | --- |
| Session | A choice for this one task; a workaround for today's state | Nowhere |
| Project | A phase order; a ruling about one project's examples | That project's file |
| Repository | A coding rule; a working preference; an engine convention | The note for its topic |

Don't make everything global, and don't treat everything as a one-off. After recording, tell the owner what you wrote and at which scope, so they can correct it.

## Templates

A topic note:

```markdown
# <Topic>

<One sentence: what this note covers, and which neighbouring notes cover what it doesn't.>

## <Sub-topic>

- **<Rule or decision as a statement>.** <Why, and where it applies. A lesson
  names what went wrong once, so the trap is recognisable.>

Related: [[<note>]], [[<project>]]
```

A project (`projects/<name>/<name>.md`):

```markdown
# <Project>

Goal: <one sentence>. Roadmap line: "<the roadmap item>".

## Decisions
<project-specific decisions; general ones are linked to their notes>

## Plan
<phases with a "done when" each>

## Backlog
<open items not yet in a phase>

## Record
<one line per finished phase: what shipped, the commit>

Related: [[<project>]], [[<note>]]
```
