# Notification Inbox

## Why

phui already covers everything you do *to* a pull request — read it, diff it,
comment on it, review it, merge it, watch its CI. What it never covered is the
thing that makes you open github.com in the first place: finding out that any of
it needs doing. The notification feed is the home page of GitHub, and without it
phui is a very good tool you go to *after* a browser tab has told you to.

An inbox is also the case where a TUI beats the web outright. Triage is a
sequence of one-key decisions over a list — `j d j d j enter` — and the browser
makes each of those a mouse target on a page that reloads.

## What we shipped

- A fifth workspace surface, `notifications`, labelled **INBOX**, at `4` / `g n`.
- Threads grouped by **what they want from you**, not by repository or recency:
  `NEEDS YOU` (review requested, approval requested, assigned, mentioned, team
  mentioned, invited) → `YOUR THREADS` (author) → `CI` → `SECURITY` →
  `WATCHING`. Bucket order is fixed, so "needs you" is at the top on the days it
  is empty too.
- Row: unread dot, subject glyph (PR / issue / release / discussion / check
  suite / commit / alert), repository, number, title, reason tag, age.
- `enter` opens a pull request **in phui** via the launch-intent machinery —
  repository scope, hydrated detail, the same surfaces as `phui owner/repo#123`.
  Issues land on the repository's Issues surface. Anything phui has no surface
  for falls back to the browser rather than dead-keying.
- `o` browser, `d` done, `m` read, `shift-u` unsubscribe, `shift-a` mark all
  read, `u` unread-only toggle, `p` participating-only toggle, `r` refresh.
- A 60s poll while the surface is visible (GitHub's own inbox floor).
- The workspace tab strip carries the unread count, fetched at startup, so the
  badge is live before you ever open the surface.

## API / architecture mapping

| Concern | Where |
|---|---|
| Domain, buckets, reason labels | `src/notifications/types.ts` |
| `gh api` seam (list + mutations) | `src/notifications/github.ts` |
| Atoms, optimistic overlays, mutation fns | `src/notifications/atoms.ts` |
| Row derivation + cursor arithmetic | `src/notifications/rows.ts` |
| Keymap layer + view handle | `src/notifications/keymap.ts` |
| Navigation bridge into the App shell | `src/notifications/navigation.ts` |
| View | `src/notifications/NotificationsView.tsx` |
| `dev:mock` fixtures | `src/notifications/mock.ts` |

REST endpoints (there is no GraphQL equivalent, hence `CommandRunner` rather
than `GitHubService`):

- `GET /notifications?all=&participating=&per_page=`
- `PATCH /notifications/threads/:id` — mark read
- `DELETE /notifications/threads/:id` — mark done
- `DELETE /notifications/threads/:id/subscription` — unsubscribe
- `PUT /notifications` with `last_read_at` — mark all read

Two structural notes:

- `CommandRunner` moved from `Layer.provide` to `Layer.provideMerge` in
  `src/services/runtime.ts` so atoms can reach it directly.
- The navigation dependency is **inverted**: `useAppShell` publishes an
  `InboxNavigator` into `src/notifications/navigation.ts` on mount, and the
  surface calls it. Same shape as the Projects view handle, and for the same
  reason — a fork-owned surface should cost one `useEffect` upstream, not a prop
  threaded through five files.

## Design decisions worth keeping

- **Listing never fails** (`E = never`); auth, rate limit, and a missing `gh`
  all become warning rows above the list. Mutations *do* fail loudly, because a
  swallowed failure leaves the list showing a lie.
- **Optimistic overlays** (`dismissed`, `read`) so a triage run does not refetch
  the feed per keystroke. They are cleared when the next real fetch lands, so a
  failed mutation's overlay cannot hide a row forever.
- **`enter` degrades rather than refuses.** A dead key on release rows would
  teach you to stop pressing it on the rows where it works.

## Open questions

- Marking a single thread *unread* has no REST endpoint. The action currently
  says so; the alternative is dropping the `m` toggle to a one-way "mark read".
- `openIssue` scopes to the repository's Issues surface but does not select the
  issue by number — the issue may not be in the loaded page (closed, paginated
  away). Selecting it needs a pending-selection channel the Issues surface
  consumes, which is more upstream surface than the payoff justified for v1.
- No desktop notification / bell on new unread. The tab badge is the signal.
- No `all=true` history browsing beyond what the inbox still holds.

## Out of scope (for v1)

- Notification settings (watch/ignore a repository, per-repository thresholds).
- Threading a notification back to the *specific comment* that caused it
  (`latest_comment_url`), rather than to the subject.
- Caching the feed in SQLite. It is one request and it is meant to be fresh.

## Status

Shipped.
