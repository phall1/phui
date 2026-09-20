import { createEffect, onCleanup } from "solid-js"
import { readMaybeAccessor, type MaybeAccessor } from "../solid-utils.js"
import { registerHandoff } from "../commands/handoffs.js"
import type { PullRequestItem } from "../domain.js"
import type { PullRequestView } from "../pullRequestViews.js"

export interface UseCommandHandoffsInput {
	readonly renderer: { destroy: () => void }
	readonly selectedPullRequest: MaybeAccessor<PullRequestItem | null>
	readonly selectedRepository: MaybeAccessor<string | null>
	readonly refreshPullRequests: (message?: string, options?: { readonly resetTransientState?: boolean }) => void
	readonly refreshIssues: () => void
	readonly loadMorePullRequests: () => boolean | Promise<void> | void
	readonly loadPullRequestDiff: (pr: PullRequestItem, options?: { readonly force?: boolean; readonly includeComments?: boolean }) => void
	readonly flashNotice: (message: string) => void
	readonly switchViewTo: (view: PullRequestView) => void
	readonly openThemeModal: () => void
	readonly openMergeModal: () => void
	readonly openCommentsView: () => void
	readonly openDiffView: () => void
	readonly openChangedFilesModal: () => void
	readonly toggleDiffFilePanel: () => void
	readonly jumpDiffFile: (direction: 1 | -1) => void
	readonly moveDiffCommentThread: (direction: 1 | -1) => void
	readonly openSelectedDiffComment: () => void
	readonly toggleDiffCommentRange: () => void
	readonly openDiffCommentModal: () => void
	readonly openReplyToSelectedComment: () => void
	readonly openEditSelectedComment: () => void
	readonly openDeleteSelectedComment: () => void
	readonly queueDiffComment: () => void
}

/**
 * Connects hook-bound imperative actions to the new command registry.
 * Each registerHandoff installs a no-arg fn closing over current state;
 * command Effects invoke them via Effect.sync(() => invokeHandoff(key)).
 *
 * Centralizing this here keeps App.tsx free of ~25 useEffect lines and
 * makes the bridge between hooks and commands a single seam.
 *
 * Selection inputs accept a value or an accessor; pass accessors so a
 * re-registration sees the live selection instead of the setup snapshot.
 */
export const useCommandHandoffs = (input: UseCommandHandoffsInput): void => {
	createEffect(() => {
		onCleanup(registerHandoff("quit", () => input.renderer.destroy()))
	})
	createEffect(() => {
		onCleanup(registerHandoff("refreshPullRequests", () => input.refreshPullRequests("Refreshed", { resetTransientState: true })))
	})
	createEffect(() => {
		onCleanup(registerHandoff("refreshIssues", input.refreshIssues))
	})
	createEffect(() => {
		onCleanup(registerHandoff("loadMorePullRequests", () => void input.loadMorePullRequests()))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openThemeModal", input.openThemeModal))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openMergeModal", input.openMergeModal))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openCommentsView", input.openCommentsView))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openDiffView", input.openDiffView))
	})
	createEffect(() => {
		const selectedPullRequest = readMaybeAccessor(input.selectedPullRequest)
		onCleanup(
			registerHandoff("reloadDiff", () => {
				if (!selectedPullRequest) return
				input.loadPullRequestDiff(selectedPullRequest, { force: true, includeComments: true })
				input.flashNotice(`Refreshing diff for #${selectedPullRequest.number}`)
			}),
		)
	})
	createEffect(() => {
		onCleanup(registerHandoff("openChangedFilesModal", input.openChangedFilesModal))
	})
	createEffect(() => {
		onCleanup(registerHandoff("toggleDiffFilePanel", input.toggleDiffFilePanel))
	})
	createEffect(() => {
		onCleanup(registerHandoff("jumpDiffFileNext", () => input.jumpDiffFile(1)))
	})
	createEffect(() => {
		onCleanup(registerHandoff("jumpDiffFilePrevious", () => input.jumpDiffFile(-1)))
	})
	createEffect(() => {
		onCleanup(registerHandoff("moveDiffCommentThreadNext", () => input.moveDiffCommentThread(1)))
	})
	createEffect(() => {
		onCleanup(registerHandoff("moveDiffCommentThreadPrevious", () => input.moveDiffCommentThread(-1)))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openSelectedDiffComment", input.openSelectedDiffComment))
	})
	createEffect(() => {
		onCleanup(registerHandoff("toggleDiffCommentRange", input.toggleDiffCommentRange))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openDiffCommentModal", input.openDiffCommentModal))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openReplyToSelectedComment", input.openReplyToSelectedComment))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openEditSelectedComment", input.openEditSelectedComment))
	})
	createEffect(() => {
		onCleanup(registerHandoff("openDeleteSelectedComment", input.openDeleteSelectedComment))
	})
	createEffect(() => {
		onCleanup(registerHandoff("queueDiffComment", input.queueDiffComment))
	})
	createEffect(() => {
		const selectedRepository = readMaybeAccessor(input.selectedRepository)
		onCleanup(
			registerHandoff("viewRepository", () => {
				if (selectedRepository !== null) input.switchViewTo({ _tag: "Repository", repository: selectedRepository })
			}),
		)
	})
	createEffect(() => {
		const selectedRepository = readMaybeAccessor(input.selectedRepository)
		onCleanup(registerHandoff("viewAuthored", () => input.switchViewTo({ _tag: "Queue", mode: "authored", repository: selectedRepository })))
	})
	createEffect(() => {
		const selectedRepository = readMaybeAccessor(input.selectedRepository)
		onCleanup(registerHandoff("viewReview", () => input.switchViewTo({ _tag: "Queue", mode: "review", repository: selectedRepository })))
	})
	createEffect(() => {
		const selectedRepository = readMaybeAccessor(input.selectedRepository)
		onCleanup(registerHandoff("viewAssigned", () => input.switchViewTo({ _tag: "Queue", mode: "assigned", repository: selectedRepository })))
	})
	createEffect(() => {
		const selectedRepository = readMaybeAccessor(input.selectedRepository)
		onCleanup(registerHandoff("viewMentioned", () => input.switchViewTo({ _tag: "Queue", mode: "mentioned", repository: selectedRepository })))
	})
}
