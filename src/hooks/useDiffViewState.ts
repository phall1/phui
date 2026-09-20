import { useAtomSet as useAtomSetSolid, useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import {
	diffCommentAnchorIndexAtom,
	diffCommentRangeStartIndexAtom,
	diffCommentThreadsAtom,
	diffCommentsLoadedAtom,
	diffFileIndexAtom,
	diffPreferredSideAtom,
	diffRenderViewAtom,
	diffScrollTopAtom,
	diffWhitespaceModeAtom,
	diffWrapModeAtom,
	pullRequestDiffCacheAtom,
} from "../ui/diff/atoms.js"

/**
 * Diff-view atom subscriptions bundled into one hook. The bulk of the
 * diff state lives in `ui/diff/atoms.ts`; this hook gives the app shell a
 * single named seam to read and write them through.
 *
 * Values are returned as Solid accessors so consumers stay reactive.
 */
export const useDiffViewState = () => {
	return {
		diffFileIndex: useAtomValueSolid(() => diffFileIndexAtom),
		setDiffFileIndex: useAtomSetSolid(() => diffFileIndexAtom),
		diffScrollTop: useAtomValueSolid(() => diffScrollTopAtom),
		setDiffScrollTop: useAtomSetSolid(() => diffScrollTopAtom),
		diffRenderView: useAtomValueSolid(() => diffRenderViewAtom),
		setDiffRenderView: useAtomSetSolid(() => diffRenderViewAtom),
		diffWrapMode: useAtomValueSolid(() => diffWrapModeAtom),
		diffWhitespaceMode: useAtomValueSolid(() => diffWhitespaceModeAtom),
		diffCommentAnchorIndex: useAtomValueSolid(() => diffCommentAnchorIndexAtom),
		setDiffCommentAnchorIndex: useAtomSetSolid(() => diffCommentAnchorIndexAtom),
		diffPreferredSide: useAtomValueSolid(() => diffPreferredSideAtom),
		setDiffPreferredSide: useAtomSetSolid(() => diffPreferredSideAtom),
		diffCommentRangeStartIndex: useAtomValueSolid(() => diffCommentRangeStartIndexAtom),
		setDiffCommentRangeStartIndex: useAtomSetSolid(() => diffCommentRangeStartIndexAtom),
		diffCommentThreads: useAtomValueSolid(() => diffCommentThreadsAtom),
		setDiffCommentThreads: useAtomSetSolid(() => diffCommentThreadsAtom),
		setDiffCommentsLoaded: useAtomSetSolid(() => diffCommentsLoadedAtom),
		setPullRequestDiffCache: useAtomSetSolid(() => pullRequestDiffCacheAtom),
	}
}
