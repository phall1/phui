import { createEffect } from "solid-js"
import { readMaybeAccessor, type MaybeAccessor, type MutableRefObject } from "../solid-utils.js"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { DiffCommentSide } from "../domain.js"
import type { DiffFilePatch, StackedDiffCommentAnchor } from "../ui/diff.js"
import { safeDiffFileIndex } from "../ui/diff.js"

export interface UseDiffSelectionSyncInput {
	readonly selectedIndex: MaybeAccessor<number>
	readonly selectedIssueIndex: MaybeAccessor<number>
	readonly selectedRepositoryIndex: MaybeAccessor<number>
	readonly readyDiffFiles: MaybeAccessor<readonly DiffFilePatch[]>
	readonly diffCommentAnchors: MaybeAccessor<readonly StackedDiffCommentAnchor[]>
	readonly diffFullView: MaybeAccessor<boolean>
	readonly selectedDiffCommentAnchor: MaybeAccessor<StackedDiffCommentAnchor | null>
	readonly detailPreviewScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly setDiffFileIndex: (next: number | ((current: number) => number)) => void
	readonly setDiffScrollTop: (next: number) => void
	readonly setDiffCommentAnchorIndex: (next: number | ((current: number) => number)) => void
	readonly setDiffPreferredSide: (next: DiffCommentSide | null) => void
	readonly setDiffCommentRangeStartIndex: (next: number | null | ((current: number | null) => number | null)) => void
}

/**
 * Five small synchronisation effects that keep diff-view selection
 * state consistent with the rest of the app:
 *   - Reset diff-view state and scroll detail preview when PR selection changes.
 *   - Scroll detail preview when issue/repo selection changes.
 *   - Clamp diff file index when the loaded diff set shrinks.
 *   - Clamp diff comment anchor + range start when anchor set changes.
 *   - Sync diff file index to the selected anchor while in diff view.
 *
 * Lives in its own hook so App.tsx doesn't carry five disjoint useEffects.
 */
export const useDiffSelectionSync = (input: UseDiffSelectionSyncInput): void => {
	createEffect(() => {
		readMaybeAccessor(input.selectedIndex)
		input.setDiffFileIndex(0)
		input.setDiffScrollTop(0)
		input.setDiffCommentAnchorIndex(0)
		input.setDiffPreferredSide(null)
		input.setDiffCommentRangeStartIndex(null)
		input.detailPreviewScrollRef.current?.scrollTo({ x: 0, y: 0 })
	})

	createEffect(() => {
		readMaybeAccessor(input.selectedIssueIndex)
		readMaybeAccessor(input.selectedRepositoryIndex)
		input.detailPreviewScrollRef.current?.scrollTo({ x: 0, y: 0 })
	})

	createEffect(() => {
		const readyDiffFiles = readMaybeAccessor(input.readyDiffFiles)
		input.setDiffFileIndex((current) => safeDiffFileIndex(readyDiffFiles, current))
	})

	createEffect(() => {
		const diffCommentAnchors = readMaybeAccessor(input.diffCommentAnchors)
		input.setDiffCommentAnchorIndex((current) => {
			if (diffCommentAnchors.length === 0) return 0
			return Math.max(0, Math.min(current, diffCommentAnchors.length - 1))
		})
		input.setDiffCommentRangeStartIndex((current) => {
			if (current === null || diffCommentAnchors.length === 0) return null
			return Math.max(0, Math.min(current, diffCommentAnchors.length - 1))
		})
	})

	createEffect(() => {
		if (!readMaybeAccessor(input.diffFullView)) return
		const selectedDiffCommentAnchor = readMaybeAccessor(input.selectedDiffCommentAnchor)
		if (!selectedDiffCommentAnchor) return
		input.setDiffFileIndex((current) => (current === selectedDiffCommentAnchor.fileIndex ? current : selectedDiffCommentAnchor.fileIndex))
	})
}
