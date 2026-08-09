# Stars Browser

## Why

"That repo I starred a few months ago" is one of the last errands that still
forces a browser tab. A star is a bookmark you cannot use without leaving the
terminal — and once you are on github.com looking at it, you are on github.com.

The Repos surface deliberately lists repositories you have *work* in (recents,
favourites, the cwd, anything with open PRs or issues). Starred repositories are
the opposite set: mostly things you do not contribute to. Merging them would
have made both lists worse, so Stars is its own surface.

## What we shipped

- A sixth workspace surface, `stars`, at `5` / `g s`.
- One row per starred repository: star count, `owner/name`, language,
  description, last-push age; archived repositories are dimmed and prefixed.
- `/` filters incrementally across name, description, language, and topics,
  reusing the shared workspace filter atoms (the footer already renders the
  input for any surface, so there is no private text field here).
- `s` cycles sort: recently starred → recently pushed → most stars → name.
- `enter` scopes phui to the repository — from there its pull requests, issues,
  and Actions are the surfaces you already know. `o` opens a browser,
  `shift-u` unstars, `r` refreshes.

## API / architecture mapping

| Concern | Where |
|---|---|
| Domain, sort, filter, formatting | `src/stars/types.ts` |
| `gh api` seam (list + star/unstar) | `src/stars/github.ts` |
| Atoms + optimistic removal overlay | `src/stars/atoms.ts` |
| Keymap layer + view handle | `src/stars/keymap.ts` |
| View | `src/stars/StarsView.tsx` |
| `dev:mock` fixtures | `src/stars/mock.ts` |

REST:

- `GET /user/starred?per_page=100&page=N` with
  `Accept: application/vnd.github.star+json` (without that header there is no
  `starred_at`, so "recently starred" would be unsortable).
- `PUT` / `DELETE /user/starred/:owner/:repo`.

Paging is explicit rather than `gh api --paginate`, which has no page cap: a
3,000-star account would fire thirty requests before the surface drew anything.
Five pages of 100 covers essentially everyone, and the report says so in a
warning row when it stops early instead of quietly showing a partial list.

Repository navigation reuses the Inbox's `InboxNavigator` bridge
(`src/notifications/navigation.ts`) rather than publishing a second one.

## Open questions

- No tab badge. The count would mean subscribing to the fetch at startup, which
  is up to five requests for a number nobody is waiting on.
- Beyond 500 stars the list is truncated with a warning. Real paging in the UI
  ("load more" row, like the PR list) is the obvious next step if anyone hits it.
- Starring something *new* is wired in `github.ts` (`starRepository`) but has no
  binding, because there is no browse-and-discover surface to star *from* yet.

## Out of scope (for v1)

- Starred **lists** (GitHub's own grouping) — GraphQL-only and still in preview.
- Trending / explore / search-all-of-GitHub. That is a different feature with a
  different data source; `starRepository` exists so it has something to land on.
- Caching. The list is a handful of requests and refreshes on demand.

## Status

Shipped.
