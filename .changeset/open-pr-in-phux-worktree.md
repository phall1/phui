---
"@kitlangton/ghui": minor
---

Add `w` — open the selected PR's head in an isolated git worktree inside a phux session (`pull.open-worktree`). Resolves the local clone via `repoPaths`, fetches `refs/pull/<n>/head` (works for fork PRs too), creates the worktree at the configurable `worktreePath` template (default `{{repoPath}}/.ghui/worktrees/pr-{{number}}`), and opens a phux session there: attached (TUI suspends/resumes) when ghui runs outside phux, created detached with a footer notice when ghui is already inside phux.
