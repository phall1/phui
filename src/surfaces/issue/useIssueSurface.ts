import { useAtomSet as useAtomSetSolid, useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { createEffect, createMemo, type Accessor } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { Cause } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type { MutableRefObject } from "../../solid-utils.js"
import type { IssueItem, LoadStatus } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import type { IssueView } from "../../issueViews.js"
import { issueViewCacheKey } from "../../issueViews.js"
import type { IssueLoad } from "../../issueLoad.js"
import { useIssuesLoadMore } from "../../hooks/useIssuesLoadMore.js"
import {
	activeIssueViewAtom,
	allIssuesAtom,
	hasMoreIssuesAtom,
	issueListAtom,
	issueLoadMoreSlotAvailableAtom,
	issueFetchInFlightAtom,
	issueRetryProgressAtom,
	issueOverridesAtom,
	issueQueueLoadCacheAtom,
	issuesAtom,
	pendingIssueSelectionAtom,
	issueViewRepository,
	loadMoreIssueRowSelectedAtom,
	loadedIssueCountAtom,
	resolveIssueLoad,
	selectedIssueAtom,
	showIssueRepositoryGroupsAtom,
} from "../../ui/issues/atoms.js"
import type { RetryProgress } from "../../ui/FooterHints.js"
import { issueListRowIndex } from "../../ui/IssueList.js"
import { selectedIssueIndexAtom } from "../../ui/listSelection/atoms.js"
import { useClampedIndex } from "../../ui/useClampedIndex.js"
import { useScrollFollowSelected } from "../../ui/useScrollFollowSelected.js"
import { useScrollPersistence } from "../../ui/useScrollPersistence.js"
import { workspaceSurfaceAtom } from "../../workspace/atoms.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"

type SetState<T> = (next: T | ((prev: T) => T)) => void

export interface UseIssueSurfaceInput {
	readonly username: string | null
	readonly activeWorkspaceSurface: Accessor<WorkspaceSurface>
	readonly detailFullView: Accessor<boolean>
	readonly diffFullView: Accessor<boolean>
	readonly commentsViewActive: Accessor<boolean>
	readonly refreshGenerationRef: MutableRefObject<number>
	readonly flashNotice: (message: string) => void
	readonly issueListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly issueListScrollPersistedRef: MutableRefObject<number>
}

export interface IssueSurfaceShell {
	readonly isFullscreen: boolean
	readonly issues: Accessor<readonly IssueItem[]>
	readonly allIssues: Accessor<readonly IssueItem[]>
	readonly issueLoad: Accessor<IssueLoad | null>
	readonly issuesStatus: Accessor<LoadStatus>
	readonly issuesError: Accessor<string | null>
	readonly selectedIssue: Accessor<IssueItem | null>
	readonly selectedIssueRowIndex: Accessor<number | null>
	readonly selectedIssueIndex: Accessor<number>
	readonly setSelectedIssueIndex: SetState<number>
	readonly activeIssueView: Accessor<IssueView>
	readonly setActiveIssueView: SetState<IssueView>
	readonly hasMoreIssues: Accessor<boolean>
	readonly loadedIssueCount: Accessor<number>
	readonly loadMoreIssueRowSelected: Accessor<boolean>
	readonly issueLoadMoreSlotAvailable: Accessor<boolean>
	readonly issueFetchInFlight: Accessor<boolean>
	readonly retryProgress: Accessor<RetryProgress>
	readonly setIssueQueueLoadCache: SetState<Partial<Record<string, IssueLoad>>>
	readonly currentIssueCacheKey: Accessor<string>
	readonly issueAuthorFilterActive: Accessor<boolean>
	readonly issueActiveFilterLabel: Accessor<string | null>
	readonly setIssueOverrides: SetState<Readonly<Record<string, IssueItem>>>
	readonly selectedIssueRepository: Accessor<string | null>
	readonly showIssueRepositoryGroups: Accessor<boolean>
	readonly loadMoreIssues: () => boolean
	readonly isLoadingMoreIssues: Accessor<boolean>
	readonly resetLoadingMoreIssues: () => void
}

// Issue Surface shell. Owns the issue list derivation (raw → overrides →
// filter), pagination state, selection/scroll bookkeeping, and view-mode
// filter labels. Everything reactive is returned as a Solid accessor.
export const useIssueSurface = (input: UseIssueSurfaceInput): IssueSurfaceShell => {
	const { username, activeWorkspaceSurface, detailFullView, diffFullView, commentsViewActive, refreshGenerationRef, flashNotice, issueListScrollRef, issueListScrollPersistedRef } =
		input

	const activeIssueView = useAtomValueSolid(() => activeIssueViewAtom)
	const setActiveIssueView = useAtomSetSolid(() => activeIssueViewAtom)
	const issuesResult = useAtomValueSolid(() => issuesAtom)
	const issueQueueLoadCache = useAtomValueSolid(() => issueQueueLoadCacheAtom)
	const hasMoreIssues = useAtomValueSolid(() => hasMoreIssuesAtom)
	const loadedIssueCount = useAtomValueSolid(() => loadedIssueCountAtom)
	const setIssueQueueLoadCache = useAtomSetSolid(() => issueQueueLoadCacheAtom)
	const selectedIssueIndex = useAtomValueSolid(() => selectedIssueIndexAtom)
	const setSelectedIssueIndex = useAtomSetSolid(() => selectedIssueIndexAtom)
	const setIssueOverrides = useAtomSetSolid(() => issueOverridesAtom)
	const allIssues = useAtomValueSolid(() => allIssuesAtom)
	const issues = useAtomValueSolid(() => issueListAtom)
	const selectedIssue = useAtomValueSolid(() => selectedIssueAtom)
	const loadMoreIssueRowSelected = useAtomValueSolid(() => loadMoreIssueRowSelectedAtom)
	const issueLoadMoreSlotAvailable = useAtomValueSolid(() => issueLoadMoreSlotAvailableAtom)
	const issueFetchInFlight = useAtomValueSolid(() => issueFetchInFlightAtom)
	const retryProgress = useAtomValueSolid(() => issueRetryProgressAtom)
	const showIssueRepositoryGroups = useAtomValueSolid(() => showIssueRepositoryGroupsAtom)

	const issueLoad = createMemo(() => resolveIssueLoad(activeIssueView(), issueQueueLoadCache(), issuesResult()))

	const selectedIssueRepository = createMemo(() => issueViewRepository(activeIssueView()))
	const issueAuthorFilterActive = createMemo(() => {
		const view = activeIssueView()
		return selectedIssueRepository() !== null && view._tag === "Queue" && view.mode === "authored"
	})
	const issueActiveFilterLabel = createMemo(() => (issueAuthorFilterActive() ? "author:@me" : null))
	const rawIssues = createMemo<readonly IssueItem[]>(() => issueLoad()?.data ?? [])
	const issuesStatus = createMemo<LoadStatus>(() => {
		const result = issuesResult()
		return result.waiting && rawIssues().length === 0 ? "loading" : AsyncResult.isFailure(result) && rawIssues().length === 0 ? "error" : "ready"
	})
	const issuesError = createMemo(() => {
		const result = issuesResult()
		return AsyncResult.isFailure(result) ? errorMessage(Cause.squash(result.cause)) : null
	})
	const selectedIssueRowIndex = createMemo(() => issueListRowIndex(issues(), selectedIssueIndex(), showIssueRepositoryGroups(), loadMoreIssueRowSelected()))

	const currentIssueCacheKey = createMemo(() => issueViewCacheKey(activeIssueView()))
	const { loadMoreIssues, isLoadingMoreIssues, resetLoadingMoreIssues } = useIssuesLoadMore({
		activeIssueView: activeIssueView(),
		currentIssueCacheKey: currentIssueCacheKey(),
		issueLoad: issueLoad(),
		hasMoreIssues: hasMoreIssues(),
		issueFetchInFlight: issueFetchInFlight(),
		username,
		refreshGenerationRef,
		flashNotice,
		setIssueQueueLoadCache,
	})

	useClampedIndex(() => issues().length + (issueLoadMoreSlotAvailable() ? 1 : 0), setSelectedIssueIndex)
	useScrollFollowSelected(issueListScrollRef, () => (issues().length === 0 ? null : selectedIssueRowIndex()))
	useScrollPersistence(
		issueListScrollRef,
		issueListScrollPersistedRef,
		() => activeWorkspaceSurface() === "issues" && !detailFullView() && !diffFullView() && !commentsViewActive(),
	)

	const pendingIssueSelection = useAtomValueSolid(() => pendingIssueSelectionAtom)
	const issueViewLive = useAtomValueSolid(() => activeIssueViewAtom)
	const surfaceLive = useAtomValueSolid(() => workspaceSurfaceAtom)
	const setPendingIssueSelection = useAtomSetSolid(() => pendingIssueSelectionAtom)
	createEffect(() => {
		const pending = pendingIssueSelection()
		if (!pending) return
		if (surfaceLive() !== "issues") return
		if (issueViewRepository(issueViewLive()) !== pending.repository) return
		const result = issuesResult()
		if (result.waiting) return
		const index = issues().findIndex((issue) => issue.repository === pending.repository && issue.number === pending.number)
		if (index >= 0) setSelectedIssueIndex(index)
		setPendingIssueSelection(null)
	})

	return {
		// The Issue Surface itself is never the source of fullscreen modes
		// today; detail/diff/comments live in the App-shell. Once Item-Surface
		// view modes migrate down, this will start returning a real value.
		isFullscreen: false,
		issues,
		allIssues,
		issueLoad,
		issuesStatus,
		issuesError,
		selectedIssue,
		selectedIssueRowIndex,
		selectedIssueIndex,
		setSelectedIssueIndex,
		activeIssueView,
		setActiveIssueView,
		hasMoreIssues,
		loadedIssueCount,
		loadMoreIssueRowSelected,
		issueLoadMoreSlotAvailable,
		issueFetchInFlight,
		retryProgress,
		setIssueQueueLoadCache,
		currentIssueCacheKey,
		issueAuthorFilterActive,
		issueActiveFilterLabel,
		setIssueOverrides,
		selectedIssueRepository,
		showIssueRepositoryGroups,
		loadMoreIssues,
		isLoadingMoreIssues,
		resetLoadingMoreIssues,
	}
}
