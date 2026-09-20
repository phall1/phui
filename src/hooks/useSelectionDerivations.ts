import { createMemo, type Accessor } from "solid-js"
import { useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import type { IssueItem, PullRequestComment, PullRequestItem, PullRequestLabel } from "../domain.js"
import type { DetailCommentsStatus } from "../ui/DetailsPane.js"
import {
	selectedCommentKeyAtom,
	selectedCommentsAtom,
	selectedCommentsLoadStateAtom,
	selectedCommentsStatusAtom,
	selectedCommentSubjectAtom,
	selectedItemLabelsAtom,
} from "../ui/comments/atoms.js"
import type { CommentLoadState } from "../ui/comments/loadState.js"
import type { DiffFilePatch, DiffView } from "../ui/diff.js"
import { readyDiffFilesAtom } from "../ui/diff/atoms.js"
import { filterChangedFiles } from "../ui/modals/shared.js"

export interface UseSelectionDerivationsInput {
	readonly diffRenderView: Accessor<DiffView>
	readonly contentWidth: Accessor<number>
	readonly changedFilesModalActive: Accessor<boolean>
	readonly changedFilesQuery: Accessor<string>
}

export interface SelectionDerivations {
	readonly selectedCommentSubject: Accessor<IssueItem | PullRequestItem | null>
	readonly selectedCommentKey: Accessor<string | null>
	readonly selectedItemLabels: Accessor<readonly PullRequestLabel[]>
	readonly selectedComments: Accessor<readonly PullRequestComment[]>
	readonly selectedCommentsStatus: Accessor<DetailCommentsStatus>
	readonly selectedCommentsLoadState: Accessor<CommentLoadState>
	readonly effectiveDiffRenderView: Accessor<DiffView>
	readonly readyDiffFiles: Accessor<readonly DiffFilePatch[]>
	readonly changedFileResults: Accessor<ReturnType<typeof filterChangedFiles>>
}

// Thin wrapper over the selection-derived atoms. Items that can be computed
// entirely from atoms (selectedComments, readyDiffFiles, …) live in their
// respective atom modules — see `ui/comments/atoms.ts` and `ui/diff/atoms.ts`.
// The hook owns the few derivations that depend on app-shell state (terminal
// width, modal flags). Everything is returned as an accessor.
export const useSelectionDerivations = ({ diffRenderView, contentWidth, changedFilesModalActive, changedFilesQuery }: UseSelectionDerivationsInput): SelectionDerivations => {
	const readyDiffFiles = useAtomValueSolid(() => readyDiffFilesAtom)
	const effectiveDiffRenderView = createMemo<DiffView>(() => (contentWidth() >= 100 ? diffRenderView() : "unified"))
	const changedFileResults = createMemo(() => (changedFilesModalActive() ? filterChangedFiles(readyDiffFiles(), changedFilesQuery()) : []))
	return {
		selectedCommentSubject: useAtomValueSolid(() => selectedCommentSubjectAtom),
		selectedCommentKey: useAtomValueSolid(() => selectedCommentKeyAtom),
		selectedItemLabels: useAtomValueSolid(() => selectedItemLabelsAtom),
		selectedComments: useAtomValueSolid(() => selectedCommentsAtom),
		selectedCommentsStatus: useAtomValueSolid(() => selectedCommentsStatusAtom),
		selectedCommentsLoadState: useAtomValueSolid(() => selectedCommentsLoadStateAtom),
		effectiveDiffRenderView,
		readyDiffFiles,
		changedFileResults,
	}
}
