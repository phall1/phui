# OpenTUI Solid

## Why

phui's renderables go through OpenTUI's Zig core either way. Solid skips React's reconciler and matches OpenTUI's own recommended fine-grained path. Effect 4 ships official `@effect/atom-solid` on the same rc line as `effect`.

## What

- `@opentui/react` → `@opentui/solid` 0.5.11 (`solid-js` 1.9.12, the OpenTUI peer)
- `react` / `scheduler` / `@effect/atom-react` → `solid-js` plus official `@effect/atom-solid` 4.0.0-rc.115
- `src/atom-solid.ts` is a thin React-shaped wrapper over official hooks (`useAtomValue(atom)` → `useAtomValue(() => atom)`)
- `src/solid-hooks.ts` stands in for the React hook names so the existing hook graph can mount
- Keymap host: `@phui/keymap/solid`
- Effect 4 packages (`effect`, `@effect/atom-solid`, `@effect/sql-sqlite-bun`) are `4.0.0-rc.115`

## Status

Runtime pins are OpenTUI Solid 0.5.11 + Effect `4.0.0-rc.115` + official `@effect/atom-solid`. The port itself is **not finished**: `src/solid-hooks.ts` emulates React hook semantics on Solid and is non-reactive (shim `useState` never updates JSX; shim `useEffect` never re-runs). `useAppShell` returns a one-shot snapshot and `App.tsx` hand-patches ~18 atoms to compensate. See [`solid-reactivity-migration.md`](./solid-reactivity-migration.md) for the proven findings, the structural blocker, and the ordered plan. Resize relayout and the loading spinner are casualties of this.
