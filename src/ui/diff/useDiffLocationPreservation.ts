import type { ScrollBoxRenderable } from "@opentui/core"
import { createEffect, onCleanup } from "solid-js"
import { readMaybeAccessor, type MaybeAccessor, type MutableRefObject, useRef } from "../../solid-utils.js"
import { registerHandoff } from "../../commands/handoffs.js"
import { nearestDiffAnchorForLocation, type StackedDiffCommentAnchor } from "../diff.js"

const DIFF_LAYOUT_RETRY_MS = 16
const DIFF_SCROLL_RESTORE_ATTEMPTS = 6
const DIFF_STICKY_HEADER_LINES = 2

interface PendingDiffLocationRestore {
	readonly anchor: StackedDiffCommentAnchor
	readonly screenOffset: number
}

export interface UseDiffLocationPreservationInput {
	readonly diffFullView: MaybeAccessor<boolean>
	readonly selectedDiffCommentAnchor: MaybeAccessor<StackedDiffCommentAnchor | null>
	readonly diffCommentAnchors: MaybeAccessor<readonly StackedDiffCommentAnchor[]>
	readonly diffWhitespaceMode: MaybeAccessor<string> // dependency that triggers restore re-run
	readonly diffScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly wideBodyHeight: MaybeAccessor<number>
	readonly suppressNextDiffCommentScrollRef: MutableRefObject<boolean>
	readonly setDiffCommentAnchorIndex: (next: number) => void
	readonly setDiffFileIndex: (next: number) => void
	readonly syncDiffScrollState: () => void
}

export interface UseDiffLocationPreservationResult {
	/**
	 * Snapshot the current selected anchor + viewport offset. After the diff
	 * re-renders (e.g. on view-mode toggle, wrap toggle, whitespace toggle),
	 * the hook restores scroll so the same anchor stays in the same screen
	 * row.
	 */
	readonly preserveCurrentDiffLocation: () => void
}

/**
 * Owns the "preserve scroll across diff re-render" protocol: callers
 * mark the current anchor as the restore target before mutating a diff
 * setting, and the hook's effect runs after the new render and walks
 * a layout-settle retry loop until the scrollbox can actually reach
 * the target position.
 */
export const useDiffLocationPreservation = (input: UseDiffLocationPreservationInput): UseDiffLocationPreservationResult => {
	const pendingDiffLocationRestoreRef = useRef<PendingDiffLocationRestore | null>(null)
	const diffLocationRestoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	onCleanup(() => {
		if (diffLocationRestoreTimeoutRef.current !== null) clearTimeout(diffLocationRestoreTimeoutRef.current)
	})

	createEffect(() => {
		const diffFullView = readMaybeAccessor(input.diffFullView)
		readMaybeAccessor(input.diffWhitespaceMode)
		const diffCommentAnchors = readMaybeAccessor(input.diffCommentAnchors)
		const pending = pendingDiffLocationRestoreRef.current
		if (!pending || !diffFullView || diffCommentAnchors.length === 0) return
		pendingDiffLocationRestoreRef.current = null
		const nextAnchor = nearestDiffAnchorForLocation(diffCommentAnchors, pending.anchor)
		if (!nextAnchor) return
		if (diffLocationRestoreTimeoutRef.current !== null) clearTimeout(diffLocationRestoreTimeoutRef.current)
		input.suppressNextDiffCommentScrollRef.current = true
		input.setDiffCommentAnchorIndex(diffCommentAnchors.indexOf(nextAnchor))
		input.setDiffFileIndex(nextAnchor.fileIndex)

		let attempts = 0
		const restoreScroll = () => {
			attempts++
			const scroll = input.diffScrollRef.current
			if (scroll) {
				const viewportHeight = Math.max(1, scroll.viewport.height)
				const maxScrollTop = Math.max(0, scroll.scrollHeight - viewportHeight)
				const targetTop = Math.max(0, nextAnchor.renderLine - pending.screenOffset)
				const nextTop = Math.min(maxScrollTop, targetTop)
				input.suppressNextDiffCommentScrollRef.current = true
				if (Math.floor(scroll.scrollTop) !== nextTop) {
					scroll.scrollTo({ x: 0, y: nextTop })
					input.syncDiffScrollState()
				}
				if (maxScrollTop >= targetTop && Math.floor(scroll.scrollTop) === targetTop) {
					input.suppressNextDiffCommentScrollRef.current = false
					diffLocationRestoreTimeoutRef.current = null
					return
				}
			}
			if (attempts < DIFF_SCROLL_RESTORE_ATTEMPTS) {
				diffLocationRestoreTimeoutRef.current = globalThis.setTimeout(restoreScroll, DIFF_LAYOUT_RETRY_MS)
			} else {
				input.suppressNextDiffCommentScrollRef.current = false
				diffLocationRestoreTimeoutRef.current = null
			}
		}
		diffLocationRestoreTimeoutRef.current = globalThis.setTimeout(restoreScroll, DIFF_LAYOUT_RETRY_MS)
	})

	const preserveCurrentDiffLocation = () => {
		const diffFullView = readMaybeAccessor(input.diffFullView)
		const selectedDiffCommentAnchor = readMaybeAccessor(input.selectedDiffCommentAnchor)
		if (diffFullView && selectedDiffCommentAnchor) {
			const scroll = input.diffScrollRef.current
			const wideBodyHeight = readMaybeAccessor(input.wideBodyHeight)
			const maxScreenOffset = Math.max(DIFF_STICKY_HEADER_LINES, (scroll?.viewport.height ?? wideBodyHeight) - 2)
			const rawScreenOffset = scroll ? selectedDiffCommentAnchor.renderLine - Math.floor(scroll.scrollTop) : DIFF_STICKY_HEADER_LINES
			pendingDiffLocationRestoreRef.current = {
				anchor: selectedDiffCommentAnchor,
				screenOffset: Math.max(DIFF_STICKY_HEADER_LINES, Math.min(maxScreenOffset, rawScreenOffset)),
			}
		}
	}

	// Expose to command Effects: diff toggles inside `commands/builtins.ts`
	// invoke this handoff synchronously *before* the atom write that
	// triggers a re-render, so we capture the pre-mutation scrollTop and
	// anchor.renderLine here. Re-register on dependency change so the
	// closure reflects the live values.
	createEffect(() => {
		readMaybeAccessor(input.diffFullView)
		readMaybeAccessor(input.selectedDiffCommentAnchor)
		readMaybeAccessor(input.wideBodyHeight)
		onCleanup(registerHandoff("preserveDiffLocation", preserveCurrentDiffLocation))
	})

	return { preserveCurrentDiffLocation }
}
