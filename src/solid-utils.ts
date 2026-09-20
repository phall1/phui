import { type JSX } from "solid-js"

/**
 * Small, genuinely non-reactive helpers that survived the React→Solid
 * migration. This is NOT a hook shim: there is no `useState`/`useEffect`/
 * `useMemo` here, and nothing emulates React's re-render model. Solid
 * primitives (`createSignal`, `createEffect`, `createMemo`, `onMount`,
 * `onCleanup`, …) are imported from `solid-js` directly at call sites.
 */

// Re-exported so existing call sites keep one import site for Solid primitives.
export { createContext, For, Index, onCleanup, onMount, Show, useContext } from "solid-js"
export type { ComponentProps, JSX } from "solid-js"

export type ReactNode = JSX.Element

/** Non-reactive passthrough used where a component boundary is convenient. */
export const Fragment = (props: { readonly children?: JSX.Element }): JSX.Element => props.children ?? null

export type MaybeAccessor<T> = T | (() => T)

export const readMaybeAccessor = <T>(value: MaybeAccessor<T>): T => (typeof value === "function" ? (value as () => T)() : value)

/** Test helper: run `fn` and return its result. Kept for the TUI tests' call shape. */
export const act = <T>(fn: () => T | Promise<T>): T | Promise<T> => fn()

/** A stable mutable box. Also callable so it can be passed straight to `ref=`. */
export type MutableRefObject<T> = { current: T } & ((value: T) => void)
export type RefObject<T> = { readonly current: T } & ((value: T) => void)
export type Ref<T> = T | ((value: T) => void) | MutableRefObject<T | null>

/**
 * Creates a mutable ref box once for the lifetime of the current owner. This is
 * plain object state, not React state: writing `.current` never re-renders.
 * Use `createSignal` when a change should drive the UI.
 */
export const useRef = <T>(initial: T): MutableRefObject<T> => {
	const ref = ((value: T) => {
		ref.current = value
	}) as MutableRefObject<T>
	ref.current = initial
	return ref
}
