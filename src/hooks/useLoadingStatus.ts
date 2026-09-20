import { createEffect, createMemo, type Accessor } from "solid-js"
import type { PullRequestItem } from "../domain.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import type { CloseModalState, LabelModalState, MergeModalState, PullRequestStateModalState, SubmitReviewModalState } from "../ui/modals/types.js"
import type { PullRequestDiffState } from "../ui/diff.js"
import type { DetailHydrationState } from "../ui/pullRequests/useDetailHydration.js"
import { SPINNER_FRAMES } from "../ui/spinner.js"
import { useSpinnerFrame } from "../ui/useSpinnerFrame.js"

interface PullRequestLoadShape {
	readonly fetchedAt?: Date | null
}

interface PullRequestResult {
	readonly waiting: boolean
}

export interface UseLoadingStatusInput {
	readonly selectedPullRequestDetailKey: Accessor<string | null>
	readonly detailHydrationState: Accessor<Readonly<Record<string, DetailHydrationState>>>
	readonly pullRequestResult: Accessor<PullRequestResult>
	readonly pullRequestLoad: Accessor<PullRequestLoadShape | null>
	readonly pullRequestStatus: Accessor<"loading" | "ready" | "error">
	readonly issuesStatus: Accessor<"loading" | "ready" | "error">
	readonly isLoadingMorePullRequests: Accessor<boolean>
	readonly issueFetchInFlight: Accessor<boolean>
	readonly isLoadingMoreIssues: Accessor<boolean>
	readonly activeWorkspaceSurface: Accessor<WorkspaceSurface>
	readonly selectedCommentsStatus: Accessor<"idle" | "loading" | "ready" | "error">
	readonly selectedDiffState: Accessor<PullRequestDiffState | undefined>
	readonly labelModal: Accessor<LabelModalState>
	readonly closeModal: Accessor<CloseModalState>
	readonly pullRequestStateModal: Accessor<PullRequestStateModalState>
	readonly mergeModal: Accessor<MergeModalState>
	readonly submitReviewModal: Accessor<SubmitReviewModalState>
	readonly isInitialLoading: Accessor<boolean>
	readonly startupLoadComplete: Accessor<boolean>
	readonly setStartupLoadComplete: (next: boolean) => void
	readonly selectedPullRequest: Accessor<PullRequestItem | null>
	readonly loadPullRequestComments: (pr: PullRequestItem) => void
	readonly commentsViewActive: Accessor<boolean>
	readonly detailFullView: Accessor<boolean>
	readonly isWideLayout: Accessor<boolean>
}

export interface LoadingStatus {
	readonly selectedPullRequestDetailError: Accessor<string | null>
	readonly isHydratingPullRequestDetails: Accessor<boolean>
	readonly isRefreshingPullRequests: Accessor<boolean>
	readonly isActiveSurfaceLoading: Accessor<boolean>
	readonly hasActiveLoadingIndicator: Accessor<boolean>
	readonly loadingFrame: Accessor<number>
	readonly loadingIndicator: Accessor<string>
}

/**
 * Derives the cross-cutting "is something loading?" booleans plus the spinner
 * frame the footer and headers consult. Returns accessors so the spinner and
 * the loading chrome are live.
 */
export const useLoadingStatus = (input: UseLoadingStatusInput): LoadingStatus => {
	const selectedPullRequestDetailHydrationState = createMemo(() => {
		const key = input.selectedPullRequestDetailKey()
		return key ? (input.detailHydrationState()[key] ?? null) : null
	})
	const selectedPullRequestDetailError = createMemo(() => {
		const state = selectedPullRequestDetailHydrationState()
		return state?._tag === "Error" ? (state.message ?? null) : null
	})
	const isHydratingPullRequestDetails = createMemo(() => selectedPullRequestDetailHydrationState()?._tag === "Loading")
	const isRefreshingPullRequests = createMemo(() => input.pullRequestResult().waiting && input.pullRequestLoad() !== null)
	const isActiveSurfaceLoading = createMemo(() => {
		const surface = input.activeWorkspaceSurface()
		return (
			(surface === "pullRequests" && (input.pullRequestStatus() === "loading" || isHydratingPullRequestDetails() || input.isLoadingMorePullRequests())) ||
			(surface === "issues" && (input.issuesStatus() === "loading" || input.isLoadingMoreIssues()))
		)
	})
	const hasActiveLoadingIndicator = createMemo(
		() =>
			input.pullRequestResult().waiting ||
			isHydratingPullRequestDetails() ||
			input.isLoadingMorePullRequests() ||
			(input.activeWorkspaceSurface() === "issues" && (input.issueFetchInFlight() || input.isLoadingMoreIssues())) ||
			input.selectedCommentsStatus() === "loading" ||
			input.labelModal().loading ||
			input.closeModal().running ||
			input.pullRequestStateModal().running ||
			input.mergeModal().loading ||
			input.mergeModal().running ||
			input.submitReviewModal().running ||
			input.selectedDiffState()?._tag === "Loading",
	)
	const loadingFrame = useSpinnerFrame({ active: hasActiveLoadingIndicator, reset: input.isInitialLoading })
	const loadingIndicator = createMemo(() => SPINNER_FRAMES[loadingFrame() % SPINNER_FRAMES.length]!)

	createEffect(() => {
		if (input.startupLoadComplete() || input.pullRequestStatus() === "loading") return
		input.setStartupLoadComplete(true)
	})

	createEffect(() => {
		const current = input.selectedPullRequest()
		if (input.pullRequestStatus() !== "ready" || !current) return
		if (!input.commentsViewActive() && !input.detailFullView() && !input.isWideLayout()) return
		input.loadPullRequestComments(current)
	})

	return {
		selectedPullRequestDetailError,
		isHydratingPullRequestDetails,
		isRefreshingPullRequests,
		isActiveSurfaceLoading,
		hasActiveLoadingIndicator,
		loadingFrame,
		loadingIndicator,
	}
}
