import { useAtomSet as useAtomSetSolid, useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { commentsViewActiveAtom, commentsViewSelectionAtom } from "../ui/comments/atoms.js"
import { detailFullViewAtom, detailScrollOffsetAtom } from "../ui/detail/atoms.js"
import { diffFullViewAtom } from "../ui/diff/atoms.js"
import { runsFullViewAtom } from "../ui/runs/atoms.js"

/**
 * The three full-screen view-mode flags plus the comments-view
 * selection cursor. Together they decide which sub-mode is showing
 * inside `PullRequestSurface` and which keymap layer is active.
 *
 * Returns Solid accessors (not values) so consumers stay reactive.
 */
export const useViewModeState = () => {
	const detailFullView = useAtomValueSolid(() => detailFullViewAtom)
	const setDetailScrollOffset = useAtomSetSolid(() => detailScrollOffsetAtom)
	const diffFullView = useAtomValueSolid(() => diffFullViewAtom)
	const runsFullView = useAtomValueSolid(() => runsFullViewAtom)
	const commentsViewActive = useAtomValueSolid(() => commentsViewActiveAtom)
	const commentsViewSelection = useAtomValueSolid(() => commentsViewSelectionAtom)
	return {
		detailFullView,
		setDetailFullView: useAtomSetSolid(() => detailFullViewAtom),
		setDetailScrollOffset,
		diffFullView,
		setDiffFullView: useAtomSetSolid(() => diffFullViewAtom),
		runsFullView,
		setRunsFullView: useAtomSetSolid(() => runsFullViewAtom),
		commentsViewActive,
		setCommentsViewActive: useAtomSetSolid(() => commentsViewActiveAtom),
		commentsViewSelection,
		setCommentsViewSelection: useAtomSetSolid(() => commentsViewSelectionAtom),
	}
}
