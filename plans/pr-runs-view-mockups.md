# PR Runs view — UI mock-ups

Visual exploration of the "view / run / investigate Actions" request, as a per-PR
view mode. Rendered in
phui's real vocabulary: header tabs, status glyphs (`✓ ✗ ● ○ ↻`), `◆` group icon,
box frames, footer hint row.

**Direction (decided):** the runs view is a **PR view mode**, exactly like the diff
view — you're on a PR, hit a shortcut (`a`), and it takes over the pane scoped to
*that* PR's runs. It is *not* a separate tab and *not* a modal. It's a peer of
`diff` / `comments` / `detail`, built on the same view-mode seam
(`useViewModeState`, `PullRequestSurface`, a keymap context, `runs.open`/`runs.close`).

A repo-wide Actions *surface* (4th tab) is left as possible later work, but the
modular per-PR page below is the thing we're building, and the same run-detail
rendering would power a surface later if we want it.

Glyphs reused from the existing checks UI:
`✓` success · `✗` failure · `●` in-progress · `○` queued · `↻` re-run/refresh · `⊘` cancelled · `·` skipped/none

---

## Entry point — from a PR

You're in the PR list or detail. The PR shows its check rollup already; press `a`
("actions") to open the **runs view** for that PR, full-screen in the pane — the
exact gesture as `d` for diff.

```
 ◆ Today                                          ⌥ #1004  ✗
 ✗ #1004  feat(diff): viewport windowing            kitlangton  2m
          feat/diff-windowing  →  main
          ↑↓ select   enter details   d diff   a runs   c comments
```

`a` is enabled whenever the selected PR has runs (disabled reason otherwise, like
`diff.open`). It opens view **A** below, scoped to this PR's head SHA. `esc` returns.

---

## A. Runs list (this PR's runs)

The view opens on the PR's runs — usually one per workflow on the head commit,
plus any re-runs. Compact, status-first, newest first.

```
 PR #1004 ┌─────────────────────────────────────────────────────────────────────────────┐
──────────│ feat(diff): viewport windowing                       feat/diff-windowing → main│
          │ runs for d4f9c1a · kitlangton                                                 │
          ├─────────────────────────────────────────────────────────────────────────────┤
          │ ▸ ✗ CI                  failed       2m14s    6m ago        re-run 1/1         │
          │   ✓ Lint               success      48s      6m ago                           │
          │   ● Release            in progress  1m02s    just now                         │
          │   ○ Deploy             queued        —        —                               │
          ├─────────────────────────────────────────────────────────────────────────────┤
          │ ↑↓ select  enter open run  ↻ re-run  r refresh  o browser  esc back          │
          └─────────────────────────────────────────────────────────────────────────────┘
```

Columns: status · workflow name · conclusion · duration · age · re-run marker.
`enter` (or `→`) on a run drills into view **B**. If a PR has exactly one run, `a`
can jump straight to **B** and skip this list.

---

## B. Run detail — jobs & steps (the "investigate" core)

The run, its jobs, and each job's steps. Failed steps auto-expand a log tail inline;
`enter` opens the full log for the focused step.

```
 PR #1004 ┌─────────────────────────────────────────────────────────────────────────────┐
──────────│ ✗ CI · run #4821                                             push → feat/diff…│
          │ d4f9c1a · kitlangton · 2m14s · started 6m ago · re-run 1/1                    │
          ├─────────────────────────────────────────────────────────────────────────────┤
          │ ✓ lint              12s                                                       │
          │ ✓ typecheck         28s                                                       │
          │ ▸ ✗ test (bun)      1m41s                                                     │
          │     ✓ Set up job                                                    1s         │
          │     ✓ Checkout                                                      3s         │
          │     ✓ bun install                                                 22s         │
          │     ✗ bun run test                                              1m12s  ▾       │
          │         ● test/diff/windowing.test.ts > keeps anchor row on half-page         │
          │           Expected: 14   Received: 13                                        │
          │           at test/diff/windowing.test.ts:88:36                               │
          │     ○ Upload coverage                                           skipped        │
          │ ○ deploy            queued                                                    │
          ├─────────────────────────────────────────────────────────────────────────────┤
          │ ↑↓ steps  enter expand log  n/p next failure  ↻ re-run  x cancel  esc back   │
          └─────────────────────────────────────────────────────────────────────────────┘
```

- `↑↓` walks jobs/steps; `n/p` jumps between failures (like diff threads).
- Failed steps show a tail (`▾`); `enter` expands the full log for the focused step
  (scrollable, reusing the same scroll machinery as the diff/detail panes).
- Actions: `↻` re-run (all / failed-only), `x` cancel a running run, `o` open in
  browser, `[`/`]` to step between this run and sibling runs without leaving B.
- `esc` from B → back to the runs list (A); `esc` from A → back to the PR.

---

## How it maps onto the existing diff-view seam

The runs view is a **peer of the diff view**, reusing the same machinery rather than
inventing a parallel one:

| Diff view                         | Runs view (new)                       |
| --------------------------------- | ------------------------------------- |
| `diffFullViewAtom`                | `runsFullViewAtom` (in `useViewModeState`) |
| `diff.open` / `diff.close` (`d`)  | `runs.open` / `runs.close` (`a`)      |
| `diffView` keymap context         | `runsView` keymap context             |
| `if (diffFullView)` pane branch in `PullRequestSurface` | `if (runsFullView)` pane branch |
| `PullRequestDiffPane`             | `PullRequestRunsPane` (list + detail) |
| changed-files navigation `[`/`]`  | run / step navigation `[`/`]`, `n`/`p` |

State scoped to the selected PR; nothing is repo-global, so it slots in beside diff
without touching workspace tabs or surfaces.

### GitHubService methods (all `gh`-backed, PR-scoped)

- `listPullRequestRuns(repo, number | headSha)` → view A
  (`gh run list --commit <sha> --json …` or `--branch <headRef>`).
- `getRunDetails(repo, runId)` → jobs + steps for B (`gh run view <id> --json jobs,…`).
- `getRunStepLog(repo, runId, step?)` → expanded log (`gh run view <id> --log[-failed]`).
- `rerunRun(repo, runId, { failedOnly })` (`gh run rerun <id> [--failed]`).
- `cancelRun(repo, runId)` (`gh run cancel <id>`).

A `MockGitHubService` fixture supplies runs/jobs/steps so the whole flow is testable
and demoable in mock mode, like the rest of phui.

---

## Build slices

1. **Read-only investigate**: `runsFullViewAtom`, `a` open/close, `PullRequestRunsPane`
   (A + B), `runsView` keymap, `listPullRequestRuns` + `getRunDetails` + log expand.
   This alone covers "see a PR's runs in detail" — the requested core.
2. **Actions**: `↻` re-run / re-run-failed, `x` cancel.
3. **Later (optional)**: a repo-wide Actions *surface* (4th tab) reusing the same
   run-detail rendering, plus `workflow_dispatch`.

## Status

Shipped — implemented per `github-actions-runs.md`. The rendered view matches these
mock-ups (runs list → run detail with job/step rows and failure expansion).
```
