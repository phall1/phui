import { createSignal, getOwner, onCleanup, type Accessor, type JSX, type Owner } from "solid-js"

export { createContext, useContext, onCleanup, onMount, For, Show, Index, type JSX } from "solid-js"
export type { ComponentProps } from "solid-js"

export type MaybeAccessor<T> = T | (() => T)

export const readMaybeAccessor = <T>(value: MaybeAccessor<T>): T => (typeof value === "function" ? (value as () => T)() : value)

export type MutableRefObject<T> = { current: T } & ((el: T) => void)
export type RefObject<T> = { readonly current: T } & ((el: T) => void)
export type Ref<T> = T | ((value: T) => void) | MutableRefObject<T | null>

type HookFrame = {
	index: number
	slots: unknown[]
	resetScheduled: boolean
}

const frames = new WeakMap<Owner, HookFrame>()
const fallbackFrame: HookFrame = { index: 0, slots: [], resetScheduled: false }

const scheduleReset = (frame: HookFrame) => {
	if (frame.resetScheduled) return
	frame.resetScheduled = true
	queueMicrotask(() => {
		frame.index = 0
		frame.resetScheduled = false
	})
}

const frameForOwner = (): HookFrame => {
	const owner = getOwner()
	if (!owner) return fallbackFrame
	const existing = frames.get(owner)
	if (existing) return existing
	const created: HookFrame = { index: 0, slots: [], resetScheduled: false }
	frames.set(owner, created)
	return created
}

export const useHookSlot = <T>(create: () => T): T => {
	const frame = frameForOwner()
	const index = frame.index++
	scheduleReset(frame)
	if (index === frame.slots.length) frame.slots.push(create())
	return frame.slots[index] as T
}

const depsEqual = (left: readonly unknown[] | undefined, right: readonly unknown[] | undefined) => {
	if (left === right) return true
	if (left === undefined || right === undefined || left.length !== right.length) return false
	for (let i = 0; i < left.length; i++) {
		if (!Object.is(left[i], right[i])) return false
	}
	return true
}

export const useRef = <T>(initial: T): MutableRefObject<T> =>
	useHookSlot(() => {
		const ref = ((el: T) => {
			ref.current = el
		}) as MutableRefObject<T>
		ref.current = initial
		return ref
	})

export const useState = <T>(initial: T | (() => T)): [T, (next: T | ((current: T) => T)) => void] => {
	const [get, set] = useHookSlot(() => createSignal(typeof initial === "function" ? (initial as () => T)() : initial, { equals: false }))
	return [get(), set]
}

export const useMemo = <T>(compute: () => T, deps?: readonly unknown[]): T => {
	const slot = useHookSlot(() => ({ deps: undefined as readonly unknown[] | undefined, value: undefined as T, initialized: false }))
	if (!slot.initialized || !depsEqual(slot.deps, deps)) {
		slot.initialized = true
		slot.deps = deps
		slot.value = compute()
	}
	return slot.value
}

export const useCallback = <T extends (...args: never[]) => unknown>(fn: T, _deps?: readonly unknown[]): T => fn

export const useEffect = (fn: () => void | (() => void), deps?: readonly unknown[]): void => {
	const slot = useHookSlot(() => {
		const state: { deps: readonly unknown[] | undefined; cleanup: (() => void) | undefined } = { deps: undefined, cleanup: undefined }
		onCleanup(() => state.cleanup?.())
		return state
	})
	if (depsEqual(slot.deps, deps) && slot.deps !== undefined) return
	slot.cleanup?.()
	slot.deps = deps
	const cleanup = fn()
	slot.cleanup = typeof cleanup === "function" ? cleanup : undefined
}

export const useLayoutEffect = useEffect

export const useEffectEvent = <T extends (...args: never[]) => unknown>(fn: T): T => fn

export const act = <T>(fn: () => T | Promise<T>): T | Promise<T> => fn()

export const Fragment = (props: { readonly children?: JSX.Element; readonly key?: string | number }): JSX.Element => props.children ?? null

export type ReactNode = JSX.Element
export type AccessorValue<T> = T extends Accessor<infer A> ? A : T

export namespace React {
	export type ReactNode = JSX.Element
	export type MutableRefObject<T> = { current: T } & ((el: T) => void)
}

const React = { Fragment }
export default React
