# Agent cockpit handoff

## Why

`ghui` is already a strong human review surface, while terminal services and coding agents are better at long-running automation. The useful composition is not to make a bot keyboard-drive the TUI or to duplicate the GitHub API behind a new MCP server. It is to let an agent hand an exact pull request to a persistent `ghui` pane when human judgment is needed, then continue from authoritative GitHub state after the review.

`phux` is a natural host for that flow: it can persist and place an arbitrary TUI, expose the same pane to local or remote clients, route input without changing a human client's focus, and surface an agent's advisory `ask` event.

A local feasibility smoke on 2026-07-24 used released `phux 0.3.0` and `ghui 0.10.0`: `ghui` rendered correctly in a detached phux terminal, `phux snapshot --json` returned its 80x24 screen, and `phux send-keys ... a` opened the selected PR's Actions view. Terminal-level composition works today.

## What we'd ship

1. **Supported launch targets in ghui**
   - Accept an optional repository or pull-request target, including `owner/repo`, `owner/repo#123`, and a GitHub pull-request URL.
   - Accept `--view details|diff|comments|runs` for a pull-request target.
   - Load a directly targeted PR even when it is outside the bounded initial queue, select it, then open the requested view.
   - Keep ordinary `ghui` startup unchanged when no target is supplied.

2. **A documented phux handoff recipe**
   - Launch ghui beside an exact agent pane with `phux spawn --target ... --split vertical -c <repo> -- ghui owner/repo#123 --view diff`.
   - Pair the launch with `phux ask` when the agent needs human judgment.
   - Have the agent observe review decisions, comments, and checks through `gh` or the GitHub API rather than scraping ghui's screen.

3. **Useful terminal identity**
   - Update the terminal title from live ghui state, for example `ghui · owner/repo#123 · diff`.
   - This gives phux and other terminal hosts a lightweight, generic way to label and observe the review pane through their existing title/event surfaces.

4. **Optional declarative phux integration**
   - Provide an integration template with `kind = "terminal-tui"`, `[launch].command = ["ghui"]`, and `working_directory = "workspace"` so an enabled plugin can expose `phux launch ghui`.
   - Keep direct `phux spawn -- ghui ...` as the dependency-free contract; ghui must not require phux.

A representative flow:

```text
agent works in pane @7
  -> creates or updates owner/repo#123 through gh
  -> reports an advisory review request through phux ask @7
  -> spawns ghui beside @7, targeted at owner/repo#123 --view diff
human reviews/comments/approves in ghui
  -> agent observes GitHub state through gh/API
  -> agent resumes or raises the next concrete question
```

## API / architecture mapping

### Launch intent

Add a pure parser, independent of OpenTUI and process startup:

```ts
type GhuiLaunchIntent =
  | { readonly _tag: "Default" }
  | { readonly _tag: "Repository"; readonly repository: string }
  | {
      readonly _tag: "PullRequest"
      readonly repository: string
      readonly number: number
      readonly view: "details" | "diff" | "comments" | "runs"
    }
```

- `src/standalone.ts` and source-mode startup pass application arguments through unchanged today; parse the application arguments before rendering in `src/index.tsx` or a small CLI/bootstrap module.
- Seed a `launchIntentAtom` (or explicit bootstrap input) rather than reading `process.argv` from React hooks.
- Repository targets initialize `workspaceScopeAtom` and the repository view.
- PR targets call the existing `GitHubService.getPullRequestDetails(repository, number)`. Merge the returned item through the canonical PR queue/cache path so selection, details, comments, diff, mutations, and refresh all refer to the same object.
- Open the requested view only after the targeted item is published. `runs` also needs the hydrated head SHA.
- Reuse the current URL/link parsing rules where possible, but do not rely on `selectPullRequestByUrl` alone: it only selects an item already present in `visiblePullRequests`.
- Invalid syntax or an incompatible `--view` fails before entering the alternate screen and prints a concise usage error.

### Terminal title

Add a tiny terminal-presentation adapter that derives a title from selected repository/item and active full-screen view. Write OSC 0 only when the derived title changes, and reset to `ghui` when returning to the home surface. This remains terminal-standard behavior with no phux import or runtime dependency.

### phux adapter

The baseline is existing public CLI surface, not a new wire protocol or plugin:

```sh
phux spawn --target @7 --split vertical -c /path/to/repo -- \
  ghui owner/repo#123 --view diff
phux ask @7 --id owner-repo-123-review \
  "owner/repo#123 is ready for review"
```

The self-contained optional plugin lives in `phux-plugin/`. Its manifest
targets phux 0.3.0 or newer, and `integrations/ghui.toml` exposes the same
`["ghui"]` argv through open-vocabulary kind `terminal-tui` in the caller's
workspace:

```sh
phux plugin link ./phux-plugin/phux-plugin.toml
phux plugin enable ghui
phux launch ghui -- owner/repo#123 --view diff
```

This setup is manual; installing ghui through Homebrew does not install or
enable the plugin. The adapter receives no GitHub credentials. The spawned
ghui process continues to use the authenticated `gh` CLI exactly as it does
outside phux.

### Agent boundary

Do not expose ghui's internal command registry, React handoffs, or screen text as the semantic automation API. The existing `GitHubService` separation is useful implementation structure, but the package currently exports only the `ghui` executable and has no supported library or JSON service contract. For v1, bots use `gh`/GitHub API for durable actions and state; ghui owns human interaction.

## Resolved decisions

1. Launch targets use a positional GitHub reference; both `owner/repo#123` and GitHub URLs are supported.
2. A pull-request target defaults to `details`; agents request `diff` explicitly when appropriate.
3. The optional integration ships as the small ghui-owned plugin in `phux-plugin/`.
4. A deep-linked PR is published through the canonical queue/cache path under its repository view for the process lifetime.
5. Standard terminal title identity is sufficient for v1; structured application metadata can remain a future generic terminal-host feature.

## Out of scope (for v1)

- A `ghui-mcp` server or a second GitHub automation API.
- Bots navigating the TUI with key sequences for merge, review, or comment actions.
- A remote-control socket for retargeting an already-running ghui process.
- Automatic merge or approval policy.
- phux-specific imports, protocol frames, or required configuration in ghui.
- Issues, repository Actions deep links, and multi-item review batches; add them after the PR handoff proves useful.

## Status

Shipped — v0.11.0; implementation commit `58fc9e4`.
Targeted repository and pull-request startup, direct PR hydration, requested
initial views, and terminal title identity are part of ghui itself with no
phux dependency. The README documents the zero-plugin handoff and
human-checkpoint boundary. `phux-plugin/` contains the optional, manually
linked phux 0.3.0+ launch integration.
