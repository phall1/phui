import { createEffect } from "solid-js"

/**
 * Clamps an index atom/state to the valid range whenever the underlying
 * list length changes. Resets to 0 if the list is empty.
 */
export const useClampedIndex = (length: number | (() => number), setIndex: (updater: (current: number) => number) => void): void => {
	createEffect(() => {
		const listLength = typeof length === "function" ? length() : length
		setIndex((current) => {
			if (listLength === 0) return 0
			return Math.max(0, Math.min(current, listLength - 1))
		})
	})
}
