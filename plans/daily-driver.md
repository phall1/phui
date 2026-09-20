# Daily driver: leave GitHub.com for PR management

Master inventory of what it takes for phui to be the place you review, comment, merge, and take PR actions — with github.com as an escape hatch (`o` / `e` / `w`), not the workflow.

This is an index, not a replacement for the per-feature plans it points at. New feature work still gets its own plan when the design is non-trivial.

Captured 2026-09-12 against `@phall/phui` 0.15.0 on `main`.

## Why

phui already covers the _read-and-drive-by_ loop: queues, details, diffs, line comments, approve/request-changes, labels, draft/ready, merge/auto-merge, close, Actions job lists, inbox, stars. The remaining GitHub.com visits are not polish. They are the actual review workflow (pending comments + one submit), thread resolution, reviewer/assignee management, updating a stale branch, editing the PR, and reading why CI failed.

At the same time the app is not yet a daily driver on large PRs: every file mounts an OpenTUI `<diff>`, diffs are not SQLite-cached, hidden surfaces still fetch at boot, and `useAppShell` is still a 1,400-LOC orchestration bag. Library pins have drifted (OpenTUI 0.5.1 vs 0.5.11, Effect 4 beta.90 vs beta.107 / rc.115).

The goal is one product: **fast enough to live in, complete enough to stop opening github.com for PRs, structured enough that new features do not land in the god-hook.**

## What already works (do not rebuild)

Enough to live in phui today if the loop is triage → read → drive-by comment → separate `shift-r` verdict → label → draft/ready → squash/merge or auto-merge → close → glance at which job failed → `e`/`w` for code.

- Queues: authored / review-requested / assigned / mentioned / repository
- Detail: title, body, labels, check rollup, +/- , files, refs, draft, reviewDecision, auto-merge
- Diff: split/unified, wrap, ignore-whitespace, file panel, sticky headers, syntax via `<diff>`, line + range comments, thread jump/reply
- Conversation: issue comments, inline comments, edit/delete own
- Review verdict: Comment / Approve / Request changes (`gh pr review`) — **not** batched with inline comments
- Merge: squash / merge-commit / rebase, auto-merge on/off, admin bypass, always delete-branch
- Close PR/issue, toggle draft, add/remove existing labels
- PR + repo Actions: list, jobs/steps, rerun, rerun-failed, cancel
- Inbox, Stars, Projects linter, launch targets, editor/worktree handoff, command palette

Escape hatches that should stay: `o` browser, `e` editor, `w` phux worktree. Conflict resolution belongs there.

## What we'd ship

Four tracks. They interleave; do not finish architecture before features, and do not dump features into `useAppShell`.

### Track A — leave GitHub.com (product)

Must-have for "I review and merge from phui":

1. **Queued pending reviews** — [`queued-reviews.md`](./queued-reviews.md). Stage N inline comments, then one Approve / Comment / Request changes. Today every `enter` on a line is a published single-comment review. This is the gap.
2. **Resolve / unresolve threads** — GraphQL `resolveReviewThread` / `unresolveReviewThread`, `isResolved` on the thread, a key in the thread modal and comments pane.
3. **Reviewers and assignees** — request/unrequest users and teams; add/remove assignees. The assigned / review-requested queues exist; the mutations do not.
4. **Update branch** — merge base into head (`gh pr comment` is the wrong tool; use `gh api graphql` `updatePullRequestBranch` or `gh pr merge` is not this). Surface conflicts the same way merge already does: refuse, send to `e`/`w`.
5. **Reopen + edit title/body** — `gh pr reopen` / `gh issue reopen`; `gh pr edit --title/--body`. Detail is read-only today.
6. **CI step logs** — [`github-actions-daily-driver.md`](./github-actions-daily-driver.md) remaining: `gh run view --log` / `--log-failed`, searchable, copy. Seeing _which_ step failed is shipped; seeing _why_ is not.
7. **Conversation timeline** — review summary bodies, force-push, labeled, converted-to-draft, merged. Today's comments pane is issue comments + inline comments only.

Second ring (still daily, slightly less blocking):

8. **Create a PR from a branch** — Projects already suggests `gh pr create`; there is no in-app flow (title/body/base/draft/reviewers).
9. **Closed / merged history** — lists are `is:open` only. Merged PRs vanish after refresh.
10. **Inbox → the comment that caused it** — [`notification-inbox.md`](./notification-inbox.md) follow-ups (`phui-4r4`, `phui-bkv`).
11. **Apply suggestion blocks** — out of scope for queued-reviews v1; needed before github.com is optional for "accept this hunk".
12. **Merge queue** — zero code. If a repo uses merge queue, merge-now/auto-merge is the wrong model.

Nice-to-have, not the bar:

- Reactions, viewed-files, hunk collapse, commits tab, custom merge message / keep-branch, file-level comments (parser currently drops them), CODEOWNERS "waiting on", GitHub Projects/milestones, deployments, artifacts, `workflow_dispatch`, retarget base, fork maintainer-edits, click-drag ranges.

### Track B — feel fast (performance)

1. **OpenTUI 0.5.1 → 0.5.11** — kitlangton landed bound large-diff rendering and split-diff resize realign on this line. Do this _before_ writing our own windowing so we do not fight a stale renderer.
2. **Stop hidden work** — [`surface-aware-loading.md`](./surface-aware-loading.md) remainder: do not subscribe `issuesAtom` / inbox at boot; gate comments/diff to visible panes; drop `body` from issue list GraphQL.
3. **Diff viewport windowing** — [`diff-rendering-performance.md`](./diff-rendering-performance.md). `PullRequestDiffPane` maps every file to `<diff>`. Semantic row model → file-section geometry → mount a viewport halo. Kill the 80ms `scrollTop` poll once geometry is owned.
4. **Cache v2.0** — [`cache-v2.md`](./cache-v2.md). Persist diffs by `headRefOid`, labels (24h), merge methods (7d). Opening a PR diff is the largest remaining network hitch. Then `--cache-info` / `--cache-clear`.

### Track C — well-engineered (so A and B do not rot)

1. **Finish app-shell deepening** — [`app-shell-deepening.md`](./app-shell-deepening.md) steps **4c** (collapse diff/comment system into the PR surface), **4d** (`useItemComments` / `itemCommentsAtom`), **5** (keymap/commands read atoms, no action-prop bag). `useAppShell` is 1,419 LOC; target ~400. `App.tsx` is already the thin manifest (82 LOC); the god-module moved, it did not disappear.
2. **Item load leftover** — [`item-load-deepening.md`](./item-load-deepening.md): one cache module, still-separate per-kind atom families.
3. **GitHubService carve** — ~40 methods in one `Effect.gen`. Split along Item / Review / Merge / Runs when Track A adds pending reviews, resolve, reviewers, update-branch. Do not split first for sport.
4. **Hook tests** — zero isolated Surface tests. `@testing-library/react` + atom `initialValues` + fixtures lifted from `MockGitHubService`. Pin the first eight invariants from the deepening brief.
5. **Dead weight** — ~~`listAllPullRequests` / `listAllIssues`; `bun.lock` workspace name `ghui`; keymap `COMPARISON.md` / `MIGRATION.md`~~ removed.

### Track D — libraries and toolchain

Do not jump to Effect 3 (`effect@3.22.2`) or `@effect/sql-sqlite-bun@0.53.0`. Stay on the Effect 4 line.

| Package                                                    | Now                     | Next                                     | Risk                                                       |
| ---------------------------------------------------------- | ----------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `@opentui/core` + `@opentui/react`                         | 0.5.1                   | **0.5.11**                               | Medium; visual/keyboard/diff regression pass               |
| `effect` + `@effect/atom-react` + `@effect/sql-sqlite-bun` | 4.0.0-beta.90           | **4.0.0-beta.107**, then rc.115          | High on RC (`effect/unstable/*` Atom/SQL/OTLP)             |
| `oxlint` / `oxfmt`                                         | 1.71.0 / 0.56.0         | 1.82.0 / 0.67.0                          | Low; format churn                                          |
| `@effect/language-service`                                 | 0.86.2                  | 0.87.2                                   | Low                                                        |
| `react` + `@types/react`                                   | 19.2.7 / 19.2.17        | 19.3.0                                   | Low–medium; after OpenTUI/Effect                           |
| `scheduler`                                                | 0.27.0                  | stay                                     | atom-react peers `<0.28.0`                                 |
| `typescript`                                               | 6.0.3                   | stay                                     | npm latest is TS 7 (native). `typecheck` is `tsc --noEmit` |
| Bun                                                        | unpinned (types 1.3.14) | pin in CI, then 1.4 + `@types/bun` 1.4.2 | Policy choice                                              |

Also: pin `oven-sh/setup-bun` bun-version; optional `googleapis/release-please-action@v5`.

Keep existing OpenTUI workarounds (alternate screen, first-frame repaint, focus CSI, option→meta, `focusable={false}` scrollboxes) until 0.5.11 proves them redundant.

## Suggested sequence

Smallest reversible slices, highest leverage first. New PR-action features land in the PR surface, not in `useAppShell`.

1. **OpenTUI 0.5.11** + oxc + language-service. Immediate renderer wins, cheap CI.
2. **Surface-aware loading.** Boot stops paying for Issues + Inbox you are not looking at.
3. **Queued reviews.** The GitHub-replacement feature.
4. **Cache v2 diffs** in parallel with (3) if two writers can keep files disjoint (`CacheService` / `useDiffLoader` vs review API + comment modal).
5. **App-shell 4c** before adding resolve-threads / reviewers UI, so those screens have a home.
6. **Resolve threads, reviewers/assignees, update branch, reopen, edit title/body.** The rest of the GitHub PR sidebar and Conversation actions.
7. **Diff windowing.** After OpenTUI 0.5.11; may be smaller than the current plan if bound rendering is enough — measure first.
8. **CI logs**, then timeline, then create-PR.
9. **Effect beta.107** whenever convenient after (1); **rc.115** only after beta.107 is green.
10. Workspace hub/filters, comments-pane redesign, merge queue, suggestions — second ring.

## API / architecture mapping (new work only)

Existing plans already map queued reviews, cache v2, diff windowing, Actions logs, app-shell. New GitHubService methods Track A still needs:

```
findPendingReview / createPendingReview / addPendingReviewComment
submitPendingReview / discardPendingReview          → queued-reviews.md
resolveReviewThread / unresolveReviewThread         → GraphQL
requestReviewers / removeReviewers                  → gh pr edit --add-reviewer / REST
addAssignees / removeAssignees                      → gh pr edit --add-assignee
updatePullRequestBranch                             → GraphQL updatePullRequestBranch
reopenPullRequest / reopenIssue                     → gh pr reopen / gh issue reopen
editPullRequestTitleBody                            → gh pr edit --title --body
createPullRequest                                   → gh pr create
listPullRequestTimeline                             → GraphQL timeline items
getWorkflowRunLogs                                  → gh run view --log[-failed]
```

Domain additions: `isResolved` on threads, requested reviewers/teams, assignees, pending review id + comments, timeline event kind.

## Open questions

- After OpenTUI 0.5.11, is file-level windowing still required, or is bound large-diff rendering enough for the PRs we actually open? Measure before implementing `diff-rendering-performance.md` in full.
- Queue-by-default vs post-by-default for inline comments: already an open question in `queued-reviews.md`. Lean remains `enter` posts, `shift+enter` queues.
- Merge queue: skip until we hit a repo that uses it, or probe `mergeStateStatus` now so merge-now does not lie.
- Effect rc.115 vs staying on beta until 4.0.0 stable. App is deep in `effect/unstable/reactivity/Atom` and `effect/unstable/sql`.
- Bun 1.3 vs 1.4 as the supported runtime. CI currently unpins setup-bun.
- TypeScript 7: out of scope until `tsc --noEmit` is a supported path for this repo.

## Out of scope (keep the browser / editor)

- Conflict resolution (working tree: `e` / `w`)
- Branch protection, rulesets, merge-queue _settings_
- GitHub Settings, billing, org policy, SSO, `gh auth login`
- Discussions, Releases, Security advisories as first-class surfaces (Inbox already falls back to browser)
- Creating labels / milestones / project boards
- Binary / LFS / submodule review
- Force-push and history rewrite
- Copilot Workspace / applying large suggestion patches in-TUI

## Existing beads that are probably stale

Verify and close rather than rebuilding:

- `phui-ts1` — merge-order of homebrew-tap PR #6 vs phui PR #3. Release automation has moved on (no tap dispatch).
- `phui-0ee` — npm `@phall` scope 404. v0.14.1 / v0.15.0 published as `@phall/phui`.
- `phui-6f8` — trusted publishing. AGENTS.md now documents it as the preferred path against `release-please.yml`.

Keep (still real, not this epic): Projects checks (`phui-1zm`, `phui-g7d`, `phui-m41`), Inbox follow-ups (`phui-bkv`, `phui-bvi`, `phui-4r4`), Stars paging (`phui-5nm`), theme id `ghui` (`phui-p8l`), phux-site / cockpit leftovers (`phui-vy2`, `phui-00i`).

## Status

In progress as a program — 2026-09-12 implementation landed GitHubService mutations (pending reviews, resolve, reviewers/assignees, update-branch, reopen, edit, create, timeline, run logs), command-registry actions, Prompt modal, cache v2 diffs, surface-aware issue/inbox loading, OpenTUI 0.5.11, Effect 4.0.0-beta.107. Tracking epic `phui-ccv` closed.

Correction (2026-09-20): the 2026-09-12 note above claimed "viewport-windowed diff file mounting" had landed. It had not — `PullRequestDiffPane` mapped every file to `<diff>` until 2026-09-20, when real file-section windowing shipped (see `diff-rendering-performance.md`). Also found: the diff scroll poll lived behind a React-style `useEffect` that never re-ran, so `diffScrollTopAtom` was never updated during scrolling; scroll ownership moved into the diff pane.

Follow-on polish (full comments-pane timeline styling, in-pane log scroller, remaining app-shell 4d/5) can proceed independently.
