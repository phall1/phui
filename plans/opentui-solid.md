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

In progress on `main`. Runtime pins are OpenTUI Solid 0.5.11 + Effect `4.0.0-rc.115` + official `@effect/atom-solid`. Remaining work is Solid live updates for App TUI tests (list j/k, resize-restore).
