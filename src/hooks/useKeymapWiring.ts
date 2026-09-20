import { useKeymap } from "@phui/keymap/solid"
import type { KeySubscribe } from "@phui/keymap/solid"
import { createMemo } from "solid-js"
import { useContext, useRef } from "../solid-utils.js"
import { RegistryContext } from "@effect/atom-solid"
import { appKeymap } from "../keymap/all.js"
import { buildAppCtx, type BuildAppCtxInput } from "../keymap/contexts/appCtx.js"
import { useOpenTuiSubscribe } from "../keyboard/opentuiAdapter.js"
import { commentsViewActiveAtom } from "../ui/comments/atoms.js"
import { detailFullViewAtom } from "../ui/detail/atoms.js"
import { diffFullViewAtom } from "../ui/diff/atoms.js"
import { filterDraftAtom, filterModeAtom, filterQueryAtom } from "../ui/filter/atoms.js"
import { activeModalAtom } from "../ui/modals/atoms.js"
import { issueListAtom, issueLoadMoreSlotAvailableAtom } from "../ui/issues/atoms.js"
import { pullRequestLoadMoreSlotAvailableAtom, visiblePullRequestsAtom } from "../ui/pullRequests/atoms.js"
import { runsFullViewAtom } from "../ui/runs/atoms.js"
import { selectedRepositoryAtom, workspaceSurfaceAtom, workspaceTabSurfacesAtom } from "../workspace/atoms.js"
import { useTextInputDispatcher, type UseTextInputDispatcherInput } from "../ui/useTextInputDispatcher.js"

export interface UseKeymapWiringInput {
	readonly disabled: boolean
	readonly ctxInput: BuildAppCtxInput
	readonly textInput: Omit<UseTextInputDispatcherInput, "disabled">
}

/**
 * Builds the keymap context, binds the renderer's input stream to the
 * keymap, and routes per-modal text input — three calls that always
 * fire together. Lifts ~140 lines of orchestration out of App.tsx;
 * App.tsx now hands over two named bundles and lets this hook wire
 * them up.
 */
export const useKeymapWiring = ({ disabled, ctxInput, textInput }: UseKeymapWiringInput): void => {
	const registry = useContext(RegistryContext)
	const subscribe = useOpenTuiSubscribe()
	const ctxInputRef = useRef(ctxInput)
	ctxInputRef.current = ctxInput
	const disabledRef = useRef(disabled)
	disabledRef.current = disabled
	const gatedSubscribe = createMemo<KeySubscribe>(() => (handler) => subscribe((stroke) => disabledRef.current || handler(stroke)))
	useKeymap(
		appKeymap,
		() => {
			const input = ctxInputRef.current
			try {
				const modal = registry.get(activeModalAtom)
				const surface = registry.get(workspaceSurfaceAtom)
				const prCount = registry.get(visiblePullRequestsAtom).length
				const issueCount = registry.get(issueListAtom).length
				const loadMore = registry.get(pullRequestLoadMoreSlotAvailableAtom)
				const issueLoadMore = registry.get(issueLoadMoreSlotAvailableAtom)
				const visibleCount = surface === "pullRequests" ? prCount + (loadMore ? 1 : 0) : surface === "issues" ? issueCount + (issueLoadMore ? 1 : 0) : input.listNav.visibleCount
				const filterMode = registry.get(filterModeAtom)
				const commentsViewActive = registry.get(commentsViewActiveAtom)
				const detailFullView = registry.get(detailFullViewAtom)
				const diffFullView = registry.get(diffFullViewAtom)
				const runsFullView = registry.get(runsFullViewAtom) || surface === "actions"
				const tabs = registry.get(workspaceTabSurfacesAtom)
				return buildAppCtx({
					...input,
					flags: {
						...input.flags,
						commandPaletteActive: modal._tag === "CommandPalette",
						commentModalActive: modal._tag === "Comment",
						deleteCommentModalActive: modal._tag === "DeleteComment",
						commentThreadModalActive: modal._tag === "CommentThread",
						changedFilesModalActive: modal._tag === "ChangedFiles",
						filterModalActive: modal._tag === "Filter",
						submitReviewModalActive: modal._tag === "SubmitReview",
						labelModalActive: modal._tag === "Label",
						themeModalActive: modal._tag === "Theme",
						openRepositoryModalActive: modal._tag === "OpenRepository",
						promptModalActive: modal._tag === "Prompt",
						mergeModalActive: modal._tag === "Merge",
						closeModalActive: modal._tag === "Close",
						pullRequestStateModalActive: modal._tag === "PullRequestState",
						filterMode,
						commentsViewActive,
						detailFullView,
						diffFullView,
						runsFullView,
						textInputActive:
							modal._tag === "Comment" ||
							modal._tag === "CommandPalette" ||
							modal._tag === "OpenRepository" ||
							modal._tag === "Prompt" ||
							modal._tag === "ChangedFiles" ||
							modal._tag === "SubmitReview" ||
							modal._tag === "Label" ||
							filterMode,
					},
					filterModeCtx: {
						cancelFilter: () => {
							registry.set(filterDraftAtom, registry.get(filterQueryAtom))
							registry.set(filterModeAtom, false)
						},
						commitFilter: () => {
							registry.set(filterQueryAtom, registry.get(filterDraftAtom))
							registry.set(filterModeAtom, false)
						},
					},
					listNav: {
						...input.listNav,
						activeSurface: surface,
						surfaces: tabs,
						visibleCount,
						hasFilter: filterMode || registry.get(filterQueryAtom).length > 0,
						canGoUpWorkspace: registry.get(selectedRepositoryAtom) !== null,
						clearFilter: () => {
							registry.set(filterQueryAtom, "")
							registry.set(filterDraftAtom, "")
							registry.set(filterModeAtom, false)
						},
					},
				})
			} catch {
				return buildAppCtx(input)
			}
		},
		gatedSubscribe(),
	)
	useTextInputDispatcher({
		...textInput,
		disabled,
		get commandPaletteActive() {
			return registry.get(activeModalAtom)._tag === "CommandPalette"
		},
		get workspaceTabSurfaces() {
			return registry.get(workspaceTabSurfacesAtom)
		},
		get activeWorkspaceSurface() {
			return registry.get(workspaceSurfaceAtom)
		},
		get filterMode() {
			return registry.get(filterModeAtom)
		},
		setFilterDraft: (next: string | ((prev: string) => string)) => {
			const current = registry.get(filterDraftAtom)
			registry.set(filterDraftAtom, typeof next === "function" ? next(current) : next)
		},
		get commentModalActive() {
			return registry.get(activeModalAtom)._tag === "Comment"
		},
		get openRepositoryModalActive() {
			return registry.get(activeModalAtom)._tag === "OpenRepository"
		},
		get promptModalActive() {
			return registry.get(activeModalAtom)._tag === "Prompt"
		},
	})
}
