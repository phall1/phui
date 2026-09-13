import { getOwner, onCleanup } from "solid-js"
import { createDispatcher, type Dispatcher, type DispatcherOptions } from "./dispatcher.ts"
import type { ParsedStroke } from "./keys.ts"
import type { Keymap } from "./keymap.ts"

export type KeySubscribe = (handler: (stroke: ParsedStroke) => boolean | void) => () => void

type KeymapMount<C> = {
	dispatcher: Dispatcher<C>
}

const mounts = new WeakMap<object, KeymapMount<unknown>>()

export const useKeymap = <C>(keymap: Keymap<C>, ctx: C | (() => C), subscribe: KeySubscribe, options?: DispatcherOptions): Dispatcher<C> => {
	const readCtx = () => (typeof ctx === "function" ? (ctx as () => C)() : ctx)
	const owner = getOwner()
	if (!owner) {
		const dispatcher = createDispatcher(keymap, readCtx, options)
		onCleanup(() => dispatcher.dispose())
		onCleanup(subscribe((stroke) => dispatcher.dispatch(stroke).kind !== "no-match"))
		return dispatcher
	}

	const existing = mounts.get(owner) as KeymapMount<C> | undefined
	if (existing) return existing.dispatcher

	const dispatcher = createDispatcher(keymap, readCtx, options)
	mounts.set(owner, { dispatcher } as KeymapMount<unknown>)
	onCleanup(() => {
		dispatcher.dispose()
		mounts.delete(owner)
	})
	onCleanup(subscribe((stroke) => dispatcher.dispatch(stroke).kind !== "no-match"))
	return dispatcher
}
