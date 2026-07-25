# Open PR in a phux worktree session

## Why

`e` (open in editor) hands a PR to an editor in the *main* clone, which
disturbs whatever branch is checked out there. The workflow we actually want
for hacking on / reviewing a PR is: an **isolated git worktree** with the PR's
head checked out, opened in its own **phux session**, in one keystroke —
without touching the primary working copy. (phux is a libghostty-backed
terminal multiplexer; `phux new -s NAME -c DIR` creates/attaches a session,
`--json` creates it detached.)

## What we ship

- A `w` keybinding in the PR list and detail views: "Open phux worktree".
- A `pull.open-worktree` command (palette + `w`).
- Reuses the existing `repoPaths` map from `config.json` to find the local
  clone. New optional `config.json` key:
  - `worktreePath` — template for where worktrees live, with the same
    `{{...}}` tokens as `editorCommand` (`{{repoPath}}`, `{{owner}}`,
    `{{name}}`, `{{number}}`, `{{headRef}}`, …).
    Default: `{{repoPath}}/.phui/worktrees/pr-{{number}}`.
- Mechanics, all non-interactive except the final attach:
  1. Resolve the clone via `repoPaths` (error notice if unmatched).
  2. If the worktree directory doesn't exist yet: find the git remote whose
     URL matches the PR's repository, `git fetch <remote>
     refs/pull/<n>/head`, `git worktree prune`, then
     `git worktree add -B pr/<n> <path> FETCH_HEAD`. Fetching the pull ref
     works for same-repo and fork PRs alike, no fork remote needed.
  3. When the worktree lands inside the clone, the top-level directory
     (`.phui/`) is appended to `<git-common-dir>/info/exclude` so it never
     pollutes `git status`.
  4. phux session named `<repo>-pr-<n>` (sanitized):
     - phui running **outside** phux → suspend the TUI and run
       `phux new <session> -c <worktree>` attached (create-or-attach); on
       detach the TUI resumes.
     - phui running **inside** phux (detected via `PHUX_TERMINAL_ID`) →
       `phux new -s <session> --json -c <worktree>` creates it detached
       ("name already in use" counts as success) and a footer notice says the
       session is ready to switch to.

## API / architecture mapping

- `src/worktreeCommand.ts` (pure): path-template rendering (delegates to
  `renderEditorCommand`), branch/session naming, `PHUX_TERMINAL_ID`
  detection, info/exclude entry computation. Unit-tested, no I/O.
- `src/themeStore.ts`: `loadStoredWorktreeConfig` → `{ worktreePath,
  repoPaths }`, same pattern as `loadStoredEditorConfig`.
- `src/services/WorktreeOpener.ts`: Effect service mirroring `EditorOpener`;
  owns the git/phux subprocesses and returns the success-notice text. Mock
  no-op layer for tests/mock mode.
- `src/commands/builtins.ts`: `pull.open-worktree`, `scope: "Pull request"`,
  `shortcut: "w"`, disabled when no PR selected.
- Keymap: `list.open-worktree` (`w`, PR surface) and `detail.open-worktree`
  (`w`) → `pull.open-worktree`. Diff view keeps `w` = toggle wrap.

## Open questions

- Refresh an existing worktree when the PR has new commits? v1 opens it
  as-is; a fetch-and-ff could come later.
- Cleanup command (`git worktree remove` + `phux kill`) for merged/closed
  PRs — future `pull.remove-worktree`.
- Other multiplexers (tmux/zellij)? Could generalize to a
  `worktreeSessionCommand` template later; v1 is phux-only.

## Status

Shipped (initial) — `w` opens the selected PR's head in an isolated worktree
inside a phux session, attaching directly outside phux and creating detached
with a notice inside phux.
