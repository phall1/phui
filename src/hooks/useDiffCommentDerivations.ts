import { createMemo, type Accessor } from "solid-js"
import type { PullRequestReviewComment } from "../domain.js"
import {
	buildStackedDiffFiles,
	diffCommentAnchorLabel,
	diffCommentLocationKey,
	getStackedDiffCommentAnchors,
	PullRequestDiffState,
	type DiffFilePatch,
	type DiffView,
	type DiffWhitespaceMode,
	type DiffWrapMode,
	type StackedDiffCommentAnchor,
	type StackedDiffFilePatch,
	type PullRequestDiffState as PullRequestDiffStateType,
} from "../ui/diff.js"
import { diffCommentRangeContains, diffCommentRangeLabel, diffCommentRangeSelection, diffCommentThreadMapKey } from "../ui/diff/comments.js"

export interface UseDiffCommentDerivationsInput {
	readonly selectedDiffState: Accessor<PullRequestDiffStateType | undefined>
	readonly readyDiffFiles: Accessor<readonly DiffFilePatch[]>
	readonly effectiveDiffRenderView: Accessor<DiffView>
	readonly diffWrapMode: Accessor<DiffWrapMode>
	readonly diffWhitespaceMode: Accessor<DiffWhitespaceMode>
	// The outer width the diff pane actually renders at. When the docked file
	// panel is hidden this matches contentWidth, but with the panel docked the
	// diff lives in a narrower slice. buildStackedDiffFiles splits this in
	// half for the split view, so passing the full contentWidth here causes
	// the OLD/NEW columns to be unequal.
	readonly diffPaneWidth: Accessor<number>
	readonly diffFullView: Accessor<boolean>
	readonly diffCommentAnchorIndex: Accessor<number>
	readonly diffCommentRangeStartIndex: Accessor<number | null>
	readonly selectedDiffKey: Accessor<string | null>
	readonly diffCommentThreads: Accessor<Record<string, readonly PullRequestReviewComment[]>>
}

export interface DiffCommentDerivations {
	readonly displayedDiffState: Accessor<PullRequestDiffStateType | undefined>
	readonly stackedDiffFiles: Accessor<readonly StackedDiffFilePatch[]>
	readonly diffCommentAnchors: Accessor<readonly StackedDiffCommentAnchor[]>
	readonly selectedDiffCommentAnchorIndex: Accessor<number>
	readonly selectedDiffCommentAnchor: Accessor<StackedDiffCommentAnchor | null>
	readonly diffCommentRangeStartAnchor: Accessor<StackedDiffCommentAnchor | null>
	readonly selectedDiffCommentRange: Accessor<ReturnType<typeof diffCommentRangeSelection>>
	readonly selectedDiffCommentRangeAnchors: Accessor<readonly StackedDiffCommentAnchor[]>
	readonly diffCommentRangeActive: Accessor<boolean>
	readonly selectedDiffCommentLabel: Accessor<string | null>
	readonly selectedDiffCommentThread: Accessor<readonly PullRequestReviewComment[]>
	readonly diffLineColorContextKey: Accessor<string | null>
	readonly diffCommentThreadAnchors: Accessor<readonly StackedDiffCommentAnchor[]>
}

export const useDiffCommentDerivations = (input: UseDiffCommentDerivationsInput): DiffCommentDerivations => {
	const displayedDiffState = createMemo<PullRequestDiffStateType | undefined>(() => {
		const state = input.selectedDiffState()
		const files = input.readyDiffFiles()
		return state?._tag === "Ready" ? PullRequestDiffState.Ready({ patch: files.map((file) => file.patch).join("\n"), files }) : state
	})
	const stackedDiffFiles = createMemo(() => buildStackedDiffFiles(input.readyDiffFiles(), input.effectiveDiffRenderView(), input.diffWrapMode(), input.diffPaneWidth()))
	const diffCommentAnchors = createMemo(() =>
		input.diffFullView() ? getStackedDiffCommentAnchors(stackedDiffFiles(), input.effectiveDiffRenderView(), input.diffWrapMode(), input.diffPaneWidth()) : [],
	)
	const selectedDiffCommentAnchorIndex = createMemo(() => Math.max(0, Math.min(input.diffCommentAnchorIndex(), diffCommentAnchors().length - 1)))
	const selectedDiffCommentAnchor = createMemo(() => diffCommentAnchors()[selectedDiffCommentAnchorIndex()] ?? null)
	const diffCommentRangeStartAnchor = createMemo(() => {
		const startIndex = input.diffCommentRangeStartIndex()
		return startIndex === null ? null : (diffCommentAnchors()[Math.max(0, Math.min(startIndex, diffCommentAnchors().length - 1))] ?? null)
	})
	const selectedDiffCommentRange = createMemo(() => diffCommentRangeSelection(diffCommentRangeStartAnchor(), selectedDiffCommentAnchor()))
	const selectedDiffCommentRangeAnchors = createMemo(() =>
		selectedDiffCommentRange() ? diffCommentAnchors().filter((anchor) => diffCommentRangeContains(selectedDiffCommentRange()!, anchor)) : [],
	)
	const diffCommentRangeActive = createMemo(() => selectedDiffCommentRange() !== null)
	const selectedDiffCommentLabel = createMemo(() => {
		const range = selectedDiffCommentRange()
		if (range) return diffCommentRangeLabel(range)
		const anchor = selectedDiffCommentAnchor()
		return anchor ? diffCommentAnchorLabel(anchor) : null
	})
	const selectedDiffCommentThread = createMemo(() => {
		const key = input.selectedDiffKey()
		const anchor = selectedDiffCommentAnchor()
		const threadKey = key && anchor ? diffCommentThreadMapKey(key, anchor) : null
		return threadKey ? (input.diffCommentThreads()[threadKey] ?? []) : []
	})
	const diffLineColorContextKey = createMemo(() => {
		const key = input.selectedDiffKey()
		return key ? `${key}:${input.effectiveDiffRenderView()}:${input.diffWrapMode()}:${input.diffWhitespaceMode()}` : null
	})
	const diffCommentThreadAnchors = createMemo(() => {
		const key = input.selectedDiffKey()
		if (!key) return [] as readonly StackedDiffCommentAnchor[]
		const threads = input.diffCommentThreads()
		const seen = new Set<string>()
		return diffCommentAnchors().filter((anchor) => {
			const location = diffCommentLocationKey(anchor)
			if (seen.has(location)) return false
			if ((threads[diffCommentThreadMapKey(key, anchor)]?.length ?? 0) === 0) return false
			seen.add(location)
			return true
		})
	})

	return {
		displayedDiffState,
		stackedDiffFiles,
		diffCommentAnchors,
		selectedDiffCommentAnchorIndex,
		selectedDiffCommentAnchor,
		diffCommentRangeStartAnchor,
		selectedDiffCommentRange,
		selectedDiffCommentRangeAnchors,
		diffCommentRangeActive,
		selectedDiffCommentLabel,
		selectedDiffCommentThread,
		diffLineColorContextKey,
		diffCommentThreadAnchors,
	}
}
