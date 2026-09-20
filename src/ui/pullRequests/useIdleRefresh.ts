import { createEffect, onCleanup, type Accessor } from "solid-js"
import { type MutableRefObject, useRef } from "../../solid-utils.js"

export interface UseIdleRefreshInput {
	readonly enabled: Accessor<boolean>
	readonly lastRefreshAtRef: MutableRefObject<number>
	readonly idleAfterMs: number
	readonly jitterMs: number
	readonly onRefresh: (minimumAgeMs: number) => void
	/**
	 * Bumped externally each time the underlying refresh completes so the
	 * effect reschedules from the new "now" instead of the original mount.
	 */
	readonly refreshGeneration: Accessor<number | undefined>
}

/**
 * Schedules a one-shot timeout to refresh pull requests after the configured
 * idle period (with jitter), restarting whenever a new refresh completes or
 * the terminal regains focus.
 */
export const useIdleRefresh = ({ enabled, lastRefreshAtRef, idleAfterMs, jitterMs, onRefresh, refreshGeneration }: UseIdleRefreshInput): void => {
	const onRefreshRef = useRef(onRefresh)
	onRefreshRef.current = onRefresh
	createEffect(() => {
		if (!enabled()) return
		refreshGeneration()
		const lastRefreshAt = lastRefreshAtRef.current || Date.now()
		const ageMs = Date.now() - lastRefreshAt
		const delayMs = Math.max(0, idleAfterMs - ageMs) + Math.floor(Math.random() * jitterMs)
		const timeout = globalThis.setTimeout(() => {
			onRefreshRef.current(idleAfterMs)
		}, delayMs)
		onCleanup(() => globalThis.clearTimeout(timeout))
	})
}
