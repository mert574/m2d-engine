# Working style

How work is done on this repository, by agents and with the owner.

- **Parallel agents.** Many agents may work on the repository at once, each in its own git worktree.
  - Every message from the owner is a new checkpoint. After each one, use a new random port for any server or browser, and a new randomly named temp directory if you need one at all. Don't check whether the old one is still free; just switch.
  - Never touch, check or read another agent's work: their servers, Chrome debugging ports, worktrees, temp files, screenshots or logs. Run tests only against servers and browsers you started yourself.
  - Your own worktree's path may change between messages, though never while you are working. That needs no verification; carry on in the current one.
  - Never touch the base checkout.
- **Real GPU browser.** When running under WSL, use the native Windows Chrome (`chrome.exe`), not WSL's Chromium, which renders WebGPU in software or not at all. `launchGpuChrome` (`packages/editor-host/src/chrome.ts`) handles this; it needs mirrored networking in `.wslconfig`. Use the GPU browser for screenshots, the editor test harness and anything 3D.
- **MCP is first-class.** Every editor feature ships with its MCP tool or field in the same change, with a test. Agents build and check games through MCP, so a feature they can't reach is half done. See [[editor]].
- **Commits**: one per completed project phase, not per step.
- **Session summary at completion.** When a piece of work reaches completion, summarise the whole conversation so far in a few sentences, like a task description: what was set up and what changed, from the conversation's first message on. Include nothing from before it, even when it continues earlier work: a session resuming at phase 3 summarises from phase 3.
- **Plain names.** Call plan items by what they are ("2D particles"), never by internal codes such as F4 or E7b.
- **Where things live.** The roadmap (`docs/contributing/roadmap.md`) is one line per big item. A big item's plan, backlog and record are a project in this knowledge base ([[editor]], [[networking]], [[3d]]). Shipped behaviour is documented on its `docs/` page. Learnings and decisions go here, as described in [[README]].

Related: [[code-style]]
