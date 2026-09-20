import type { ScrollBoxRenderable } from "@opentui/core"
import { createEffect, onCleanup } from "solid-js"
import { readMaybeAccessor, type MaybeAccessor, type MutableRefObject } from "../solid-hooks.js"

/**
 * Persists a scrollbox's scrollTop across mount/unmount cycles by polling
 * while active and restoring on mount. Polling matches the diff view pattern
 * since opentui's ScrollBoxRenderable doesn't expose a scroll event.
 *
 * `active` may be a plain boolean or an accessor; pass an accessor when the
 * condition itself changes so the restore/poll effects start and stop with it.
 *
 * Use one call per (scrollRef, persistedRef, active) tuple — the captured
 * `persisted` is closed over in the polling interval, so a hook can't track
 * a backing ref that switches between renders.
 */
export const useScrollPersistence = (
	scrollRef: MutableRefObject<ScrollBoxRenderable | null>,
	persisted: MutableRefObject<number>,
	active: MaybeAccessor<boolean>,
	pollMs = 400,
): void => {
	createEffect(() => {
		if (!readMaybeAccessor(active)) return
		const scroll = scrollRef.current
		if (!scroll) return
		let cancelled = false
		let attempts = 0
		let pendingTimeout: ReturnType<typeof globalThis.setTimeout> | null = null
		const apply = () => {
			pendingTimeout = null
			if (cancelled) return
			if (scroll.viewport.height <= 0) {
				if (attempts++ < 20) pendingTimeout = globalThis.setTimeout(apply, 16)
				return
			}
			const target = persisted.current
			if (target > 0 && target !== scroll.scrollTop) scroll.scrollTo({ x: 0, y: target })
		}
		apply()
		// Track + clear the pending setTimeout: rapid `active` flips
		// (modal open/close, surface switch) used to pile up `apply` calls
		// that would land on a re-purposed scrollbox, sometimes writing
		// `scrollTo` to the wrong element.
		onCleanup(() => {
			cancelled = true
			if (pendingTimeout !== null) globalThis.clearTimeout(pendingTimeout)
		})
	})

	createEffect(() => {
		if (!readMaybeAccessor(active)) return
		const interval = globalThis.setInterval(() => {
			const top = scrollRef.current?.scrollTop
			if (top !== undefined) persisted.current = top
		}, pollMs)
		onCleanup(() => globalThis.clearInterval(interval))
	})
}
