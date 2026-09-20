# Solid Reactivity Migration

## Why

phui's React→Solid port kept React's semantics. `src/solid-hooks.ts` reimplements
`useState` / `useEffect` / `useMemo` / `useCallback` with deps arrays and
per-owner hook slots, and `src/atom-solid.ts` wraps the official
`@effect/atom-solid` hooks so call sites receive **values** instead of Solid
accessors.

Solid components run once. React hooks assume they re-run. So the shim is not
merely slower than native Solid — it is *non-reactive*, and this is proven, not
theorised:

- Native Solid signal → JSX updates ✅
- Shim `useState` → JSX **never updates** ❌
- Shim `useEffect(fn, [dep])` → fn **never re-runs** ❌

(Reproduce with the repo's own `testRender` harness; the probe is described at
the bottom of this file.)

The visible consequences:

- `useAppShell` (1,450 LOC) reads ~60 atoms through the shim and returns a
  **one-shot snapshot object** of plain values. `App.tsx` re-reads ~18 atoms by
  hand and re-passes them to override stale spread values. Everything not
  manually re-read is frozen.
- Terminal resize does not relayout: `useAppShell` snapshots `dimensions()` at
  setup, so `layout` is frozen at the size the shell first ran.
- The diff scroll poll in `useDiffCommentNavigator` sat behind a shim
  `useEffect` that never re-ran, so `diffScrollTopAtom` was never updated during
  scrolling. Fixed 2026-09-20 by moving scroll ownership into the diff pane.
- The loading spinner (`useSpinnerFrame`) never advances for the same reason.
- `useScrollPersistence` never persists or restores.

## What we'd ship

- `src/solid-hooks.ts` deleted, or reduced to genuinely non-reactive helpers
  (`Fragment`, `useRef` as a plain mutable box). No `useState` / `useEffect` /
  `useMemo` emulation.
- `src/atom-solid.ts` deleted; call sites use official accessor-returning hooks.
- `useAppShell` returns **accessors** (or a function returning the shape), not a
  snapshot; `App.tsx` stops hand-patching staleness.
- Per-Surface and derivation hooks take accessors in and return accessors/memos
  out, so layout, selection, loading, and diff state are live.

## The structural blocker (read before starting)

Layout derivations feed hooks at setup time:

```ts
const layout = computeLayout({ terminalWidth, terminalHeight, ... })
// then
useDiffCommentDerivations({ diffPaneWidth: diffFilePanelVisible ? diffPaneWidth : contentWidth, ... })
```

Hooks cannot be re-run, so a reactive `layout` cannot be threaded into a
setup-time hook call. Resolving this is the core of the migration:

- Convert derivation hooks (`useDiffCommentDerivations`,
  `useSelectionDerivations`, `useLoadingStatus`, the three `use*Surface` hooks,
  `useViewModeState`, `useDiffViewState`) to take `Accessor<T>` inputs and return
  `Accessor<T>`/memo outputs.
- Compute `layout` as a `createMemo` over `dimensions()` and the view-mode
  accessors, and pass `layout` (the memo) to those hooks.
- Convert `useAppShell`'s return to a function of accessors. `App.tsx` spreads
  `shell.contentProps()` etc. — a spread of a function result **is** reactive
  (verified), so this works without touching leaf components, whose props are
  already read inside Solid-tracked JSX.

## API / architecture mapping

- `src/solid-hooks.ts` → delete.
- `src/atom-solid.ts` → delete.
- `src/hooks/useViewModeState.ts`, `useDiffViewState.ts` → accessor-returning.
- `src/hooks/useDiffCommentDerivations.ts`, `useSelectionDerivations.ts`,
  `useLoadingStatus.ts` → accessor-in/accessor-out.
- `src/surfaces/{pullRequest,issue,repo}/use*Surface.ts` → accessor-returning.
- `src/hooks/useAppShell.ts` → return function-of-accessors; layout as a memo.
- `src/App.tsx` → call `shell.*()` instead of reading snapshot fields.
- `src/ui/*` leaf components → replace shim `useState`/`useMemo`/`useEffect`
  with `createSignal`/`createMemo`/`createEffect` (7 / 22 / 81 sites).

## Execution order (smallest reversible slice first)

1. **✅ Diff scroll ownership** (2026-09-20). Moved the scroll poll from
   `useDiffCommentNavigator` (dead shim `useEffect`) into `PullRequestDiffPane`
   via `onMount`, so windowing, sticky header, rail, and comment navigation all
   read a live `diffScrollTopAtom`. — see `diff-rendering-performance.md`.
2. **Terminal dimensions / layout.** Convert `useViewModeState` and the layout
   inputs to accessors; make `layout` a memo; return `shell.layout` and the
   width/height fields as accessors. Verify resize relayouts. Highest visible
   payoff, self-contained (only `App.tsx` consumes `useAppShell`).
3. **Loading + spinner.** `useSpinnerFrame` → accessor; `useLoadingStatus` →
   accessor; thread through the shell return.
4. **Diff/comment derivations.** `useDiffCommentDerivations` +
   `useSelectionDerivations` → accessors; drop the `App.tsx` override block.
5. **Surfaces.** Convert `usePullRequestSurface` / `useIssueSurface` /
   `useRepoSurface` to accessor returns.
6. **Leaf components.** `useState`/`useMemo`/`useEffect` → Solid primitives.
7. **Delete the shim.** Remove `src/solid-hooks.ts` and `src/atom-solid.ts`.

Each step is independently mergeable and must keep `bun run typecheck`,
`bun run lint`, and `bun test test` green.

## Open questions

- Should `useAppShell` return a function-of-accessors, or an object of
  accessors? A function keeps the current shape and one spread site; an object
  of accessors is more idiomatic Solid but touches every field read in `App.tsx`.
- How much of `useAppShell` should dissolve into per-Surface shells at the same
  time (`app-shell-deepening.md` steps 4c/5)? Doing both at once risks a very
  large diff; keeping them separate doubles the churn in the same files.
- Remount-on-resize is a tempting stopgap (key the shell host on dimensions) but
  discards component-local state; prefer the memo.

## Reproducing the shim proof

```tsx
const Probe = () => {
  const [value, setValue] = shimUseState(0)   // src/solid-hooks.ts
  set = (n) => setValue(n)
  return <text>{`v=${value}`}</text>
}
// render, set(1), renderOnce → frame still shows v=0
```

Also verified: `registry.get(atom)` inside JSX does **not** track; only the
official `useAtomValue` accessor does. So the migration cannot be done by
swapping the shim for raw registry reads.

## Status

**Shipped 2026-09-20.** `src/solid-hooks.ts` and `src/atom-solid.ts` are
**deleted**. Every call site uses Solid primitives (`createSignal`,
`createEffect`, `createMemo`, `onMount`, `onCleanup`) and the official
`@effect/atom-solid` hooks directly. The only survivors are genuinely
non-reactive helpers in `src/solid-utils.ts` (`useRef` mutable box,
`readMaybeAccessor`, ref types, `Fragment`) — no `useState`/`useEffect`/`useMemo`
emulation remains.

What that fixed along the way:

- **Terminal resize now relayouts** — `useAppShell` returns a `createMemo`; layout,
  terminal size, view-mode, and loading are live.
- **The busy spinner actually advances** — `useSpinnerFrame`/`useLoadingStatus`
  return accessors fed live inputs.
- **Selected-PR detail hydration and neighbour prefetch now run** — they sat
  behind shim `useEffect`s that ran once and never re-fired.
- **List scroll position is restored** — `useScrollPersistence` is reactive.
- **Diff viewport windowing + diff scroll ownership** (see
  `diff-rendering-performance.md`).

Known follow-up: the shell memo still does not read the PR/Issue surface
accessors, because tracking selection re-rendered the whole content tree per
keypress and tripped a native `TextBuffer` allocation storm under rapid key
bursts. `App.tsx`'s overrides keep the list/detail live. Removing that split
(per-prop accessors, or dissolving the shell into per-Surface shells) is the
remaining work; see `app-shell-deepening.md`.

## Open questions

- Should `useAppShell` return a function-of-accessors, or an object of
  accessors? A function keeps the current shape and one spread site; an object
  of accessors is more idiomatic Solid but touches every field read in `App.tsx`.
- Per-prop accessors vs. one memo: the memo must not track selection without
  also making the tab/row renderables reuse-safe (`WorkspaceTabs` now uses
  `<Index>`; other lists may need the same).
- How much of `useAppShell` should dissolve into per-Surface shells at the same
  time (`app-shell-deepening.md` steps 4c/5)?
