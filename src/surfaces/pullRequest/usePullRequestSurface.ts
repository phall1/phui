import { RegistryContext, useAtomSet as useAtomSetSolid, useAtomRefresh as useAtomRefreshSolid } from "@effect/atom-solid"
import { useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { createEffect, createMemo, type Accessor } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Cause } from "effect"
import { type MutableRefObject, useContext, useRef } from "../../solid-utils.js"
import type { LoadStatus, PullRequestItem } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import { type PullRequestView, viewCacheKey } from "../../pullRequestViews.js"
import { type PullRequestLoad } from "../../pullRequestLoad.js"
import { useDetailHydration, type DetailHydrationState } from "../../ui/pullRequests/useDetailHydration.js"
import { useLoadMore } from "../../ui/pullRequests/useLoadMore.js"
import { useRefreshCompletionToast } from "../../ui/pullRequests/useRefreshCompletionToast.js"
import { useFocusReturnRefresh } from "../../hooks/useFocusReturnRefresh.js"
import { usePullRequestRefresh } from "../../hooks/usePullRequestRefresh.js"
import { RetryProgress } from "../../ui/FooterHints.js"
import { pullRequestCommentsAtom, pullRequestCommentsLoadedAtom } from "../../ui/comments/atoms.js"
import { noticeAtom } from "../../ui/notice/atoms.js"
import { effectiveFilterQueryAtom } from "../../ui/filter/atoms.js"
import {
	activeViewAtom,
	activeViewsAtom,
	displayedPullRequestsAtom,
	groupStartsAtom,
	hasMorePullRequestsAtom,
	loadMoreRowSelectedAtom,
	loadedPullRequestCountAtom,
	pullRequestOverridesAtom,
	pullRequestLoadMoreSlotAvailableAtom,
	pullRequestsAtom,
	queueLoadCacheAtom,
	recentlyCompletedPullRequestsAtom,
	resolveLoad,
	retryProgressAtom,
	selectedPullRequestAtom,
	visibleGroupsAtom,
	visiblePullRequestsAtom,
} from "../../ui/pullRequests/atoms.js"
import { buildPullRequestListRows, pullRequestListRowIndex, type PullRequestGroups, type PullRequestListRow } from "../../ui/PullRequestList.js"
import { useScrollFollowSelected } from "../../ui/useScrollFollowSelected.js"
import { useScrollPersistence } from "../../ui/useScrollPersistence.js"
import { AUTO_REFRESH_JITTER_MS, FOCUS_RETURN_REFRESH_MIN_MS, FOCUSED_IDLE_REFRESH_MS } from "../../workspace/placeholders.js"
import { selectedIndexAtom } from "../../ui/listSelection/atoms.js"
import { selectedRepositoryAtom } from "../../workspace/atoms.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"

type SetState<T> = (next: T | ((prev: T) => T)) => void

// Structural type for the bits of the OpenTUI renderer that
// `useFocusReturnRefresh` needs — keeps the Surface decoupled from the
// concrete `Renderer` class.
interface RendererFocusEvents {
	on: (event: "focus" | "blur", handler: () => void) => void
	off: (event: "focus" | "blur", handler: () => void) => void
}

export interface UsePullRequestSurfaceInput {
	readonly renderer: RendererFocusEvents
	readonly refreshGenerationRef: MutableRefObject<number>
	readonly username: string | null
	readonly selectedIndex: number
	readonly setSelectedIndex: SetState<number>
	readonly setQueueSelection: SetState<Partial<Record<string, number>>>
	readonly visibleFilterText: string
	readonly activeWorkspaceSurface: Accessor<WorkspaceSurface>
	readonly detailFullView: Accessor<boolean>
	readonly diffFullView: Accessor<boolean>
	readonly commentsViewActive: Accessor<boolean>
	readonly flashNotice: (message: string) => void
	readonly prListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	readonly prListScrollPersistedRef: MutableRefObject<number>
}

export interface PullRequestSurfaceShell {
	readonly isFullscreen: boolean
	// Async result + derived status
	readonly pullRequestResult: Accessor<AsyncResult.AsyncResult<unknown, unknown>>
	readonly pullRequestStatus: Accessor<LoadStatus>
	readonly pullRequestError: Accessor<string | null>
	readonly pullRequestFetchInFlight: Accessor<boolean>
	readonly isInitialLoading: (startupLoadComplete: boolean) => boolean
	// View + pagination state
	readonly activeView: Accessor<PullRequestView>
	readonly setActiveView: (next: PullRequestView) => void
	readonly activeViews: Accessor<readonly PullRequestView[]>
	readonly currentQueueCacheKey: Accessor<string>
	readonly pullRequestLoad: Accessor<PullRequestLoad | null>
	readonly setQueueLoadCache: SetState<Partial<Record<string, PullRequestLoad>>>
	readonly hasMorePullRequests: Accessor<boolean>
	readonly loadedPullRequestCount: Accessor<number>
	readonly loadMoreRowSelected: Accessor<boolean>
	readonly loadMoreSlotAvailable: Accessor<boolean>
	// PR list + selection
	readonly pullRequests: Accessor<readonly PullRequestItem[]>
	readonly visiblePullRequests: Accessor<readonly PullRequestItem[]>
	readonly visibleGroups: Accessor<PullRequestGroups>
	readonly groupStarts: Accessor<readonly number[]>
	readonly selectedPullRequest: Accessor<PullRequestItem | null>
	readonly selectedRepository: Accessor<string | null>
	readonly pullRequestActiveFilterLabel: Accessor<string | null>
	readonly compactPullRequestRows: Accessor<boolean>
	readonly pullRequestListRows: Accessor<readonly PullRequestListRow[]>
	readonly selectedPullRequestRowIndex: Accessor<number | null>
	// Atom setters re-exposed for App-shell-level consumers (modals, mutations,
	// workspace navigation).
	readonly setPullRequestOverrides: SetState<Readonly<Record<string, PullRequestItem>>>
	readonly setRecentlyCompletedPullRequests: SetState<Readonly<Record<string, PullRequestItem>>>
	readonly retryProgress: Accessor<RetryProgress>
	// Load-more + refresh subsystems
	readonly loadMorePullRequests: () => boolean
	readonly isLoadingMorePullRequests: Accessor<boolean>
	readonly resetLoadingMore: () => void
	readonly armRefreshToast: (message: string) => void
	readonly cancelRefreshToast: () => void
	readonly refreshPullRequests: (message?: string, options?: { readonly resetTransientState?: boolean }) => void
	readonly detailHydrationState: Accessor<Record<string, DetailHydrationState>>
	readonly resetHydration: () => void
	// Selection helper used by link navigation + comment view jump
	readonly selectPullRequestByUrl: (url: string) => void
}

// PR Surface shell — step 4a. Owns the PR data layer:
//   • PR atom reads (queue, list, status, selection, repository).
//   • `useLoadMore` + `useDetailHydration` + the refresh subsystem
//     (`useFocusReturnRefresh` + `useRefreshCompletionToast` +
//     `usePullRequestRefresh`).
//   • PR list-row build, the row-index lookup that drives the scroll-follow
//     effect, and the scroll persistence wiring for the PR list.
//
// Everything reactive is returned as a Solid accessor so the app shell can
// compose it into its own memo.
export const usePullRequestSurface = (input: UsePullRequestSurfaceInput): PullRequestSurfaceShell => {
	const {
		renderer,
		refreshGenerationRef,
		username,
		setSelectedIndex,
		setQueueSelection,
		visibleFilterText,
		activeWorkspaceSurface,
		detailFullView,
		diffFullView,
		commentsViewActive,
		flashNotice,
		prListScrollRef,
		prListScrollPersistedRef,
	} = input
	const registry = useContext(RegistryContext)

	// Refresh refs — Surface-internal; passed to refresh sub-hooks below.
	const lastPullRequestRefreshAtRef = useRef(0)
	const pullRequestStatusRef = useRef<LoadStatus>("loading")
	const refreshPullRequestsRef = useRef<(message?: string, options?: { readonly resetTransientState?: boolean }) => void>(() => {})
	const maybeRefreshPullRequestsRef = useRef<(minimumAgeMs: number) => void>(() => {})

	// PR atom reads.
	// The queue atom tracks `activeViewAtom`; view changes interrupt the old
	// request and start the new query while keyed queue data remains cached.
	const activeView = useAtomValueSolid(() => activeViewAtom)
	const setActiveView = useAtomSetSolid(() => activeViewAtom)
	const pullRequestResult = useAtomValueSolid(() => pullRequestsAtom)
	const refreshCurrentPullRequestsAtom = useAtomRefreshSolid(() => pullRequestsAtom)
	const refreshPullRequestsAtom = () => {
		if (registry.get(pullRequestsAtom).waiting) return
		refreshCurrentPullRequestsAtom()
	}
	const queueLoadCache = useAtomValueSolid(() => queueLoadCacheAtom)
	const setQueueLoadCache = useAtomSetSolid(() => queueLoadCacheAtom)
	const setPullRequestOverrides = useAtomSetSolid(() => pullRequestOverridesAtom)
	const setRecentlyCompletedPullRequests = useAtomSetSolid(() => recentlyCompletedPullRequestsAtom)
	const setPullRequestComments = useAtomSetSolid(() => pullRequestCommentsAtom)
	const setPullRequestCommentsLoaded = useAtomSetSolid(() => pullRequestCommentsLoadedAtom)
	const setNotice = useAtomSetSolid(() => noticeAtom)
	const retryProgress = useAtomValueSolid(() => retryProgressAtom)

	const pullRequestLoad = createMemo(() => resolveLoad(activeView(), queueLoadCache(), pullRequestResult()))
	const pullRequests = useAtomValueSolid(() => displayedPullRequestsAtom)
	const pullRequestStatus = createMemo<LoadStatus>(() => {
		const result = pullRequestResult()
		return result.waiting && pullRequestLoad() === null ? "loading" : AsyncResult.isFailure(result) && pullRequestLoad() === null ? "error" : "ready"
	})
	const pullRequestFetchInFlight = createMemo(() => pullRequestResult().waiting)
	const selectedRepository = useAtomValueSolid(() => selectedRepositoryAtom)
	const pullRequestAuthorFilterActive = createMemo(() => {
		const view = activeView()
		return selectedRepository() !== null && view._tag === "Queue" && view.mode === "authored"
	})
	const pullRequestActiveFilterLabel = createMemo(() => (pullRequestAuthorFilterActive() ? "author:@me" : null))
	const compactPullRequestRows = createMemo(() => {
		const view = activeView()
		return view._tag === "Queue" && view.mode === "authored"
	})
	const pullRequestError = createMemo(() => {
		const result = pullRequestResult()
		return AsyncResult.isFailure(result) ? errorMessage(Cause.squash(result.cause)) : null
	})

	const visibleGroups = useAtomValueSolid(() => visibleGroupsAtom)
	const visiblePullRequests = useAtomValueSolid(() => visiblePullRequestsAtom)
	const selectedPullRequest = useAtomValueSolid(() => selectedPullRequestAtom)
	const effectiveFilterQuery = useAtomValueSolid(() => effectiveFilterQueryAtom)
	const filterActive = createMemo(() => effectiveFilterQuery().length > 0)
	const activeViews = useAtomValueSolid(() => activeViewsAtom)
	const currentQueueCacheKey = createMemo(() => viewCacheKey(activeView()))
	const loadedPullRequestCount = useAtomValueSolid(() => loadedPullRequestCountAtom)
	const hasMorePullRequests = useAtomValueSolid(() => hasMorePullRequestsAtom)
	const loadMoreRowSelected = useAtomValueSolid(() => loadMoreRowSelectedAtom)
	const loadMoreSlotAvailable = useAtomValueSolid(() => pullRequestLoadMoreSlotAvailableAtom)
	const groupStarts = useAtomValueSolid(() => groupStartsAtom)
	const previousSelectionStateRef = useRef({ cacheKey: currentQueueCacheKey(), visiblePullRequests: visiblePullRequests(), filterActive: filterActive() })
	const selectedIndexLive = useAtomValueSolid(() => selectedIndexAtom)
	const rememberedIndexRef = useRef(0)

	createEffect(() => {
		const filterActiveNow = filterActive()
		const selectedIndexNow = selectedIndexLive()
		const previous = previousSelectionStateRef.current
		const filterEnded = previous.filterActive && !filterActiveNow
		if (filterEnded) {
			const remembered = rememberedIndexRef.current
			const visibleNow = visiblePullRequests()
			const next = Math.max(0, Math.min(remembered, Math.max(0, visibleNow.length - 1)))
			if (next !== selectedIndexNow) setSelectedIndex(next)
			previousSelectionStateRef.current = { ...previous, filterActive: false }
			return
		}
		if (!filterActiveNow) rememberedIndexRef.current = selectedIndexNow
		previousSelectionStateRef.current = { ...previous, filterActive: filterActiveNow }
	})

	pullRequestStatusRef.current = pullRequestStatus()

	const { loadMorePullRequests, isLoadingMorePullRequests, resetLoadingMore } = useLoadMore({
		activeView: activeView(),
		currentQueueCacheKey: currentQueueCacheKey(),
		pullRequestLoad: pullRequestLoad(),
		hasMorePullRequests: hasMorePullRequests(),
		pullRequestFetchInFlight: pullRequestFetchInFlight(),
		username,
		refreshGenerationRef,
		flashNotice,
		setQueueLoadCache,
	})

	const pullRequestListRows = createMemo(() =>
		buildPullRequestListRows({
			groups: visibleGroups(),
			status: pullRequestStatus(),
			error: pullRequestError(),
			filterText: visibleFilterText,
			loadedCount: loadedPullRequestCount(),
			hasMore: loadMoreSlotAvailable(),
			isLoadingMore: isLoadingMorePullRequests(),
			compact: compactPullRequestRows(),
		}),
	)
	const selectedPullRequestRowIndex = createMemo(() => pullRequestListRowIndex(pullRequestListRows(), selectedPullRequest()?.url ?? null, loadMoreRowSelected()))

	const { detailHydrationState, resetHydration } = useDetailHydration({
		selectedPullRequest,
		pullRequestStatus,
		visiblePullRequests,
		selectedIndex: selectedIndexLive,
		currentQueueCacheKey,
		refreshGenerationRef,
		queueFetchedAtMs: createMemo(() => pullRequestLoad()?.fetchedAt?.getTime() ?? null),
		flashNotice,
	})

	const { terminalFocusedRef } = useFocusReturnRefresh({
		renderer,
		lastRefreshAtRef: lastPullRequestRefreshAtRef,
		refreshGeneration: createMemo(() => pullRequestLoad()?.fetchedAt?.getTime()),
		focusReturnMinMs: FOCUS_RETURN_REFRESH_MIN_MS,
		idleAfterMs: FOCUSED_IDLE_REFRESH_MS,
		jitterMs: AUTO_REFRESH_JITTER_MS,
		// Skip the focus-return refresh while a load-more is in flight. A
		// concurrent queue refetch would otherwise clobber the pagination
		// merge (the cache write order isn't deterministic), reverting a
		// freshly-loaded next page.
		onRefresh: (ms) => {
			if (isLoadingMorePullRequests()) return
			maybeRefreshPullRequestsRef.current(ms)
		},
	})

	const { armRefreshToast, cancelRefreshToast } = useRefreshCompletionToast({
		pullRequestStatus,
		pullRequestError,
		fetchedAt: createMemo(() => pullRequestLoad()?.fetchedAt?.getTime()),
		pullRequestLoad,
		selectedPullRequest,
		lastPullRequestRefreshAtRef,
		flashNotice,
	})

	const { refreshPullRequests } = usePullRequestRefresh({
		pullRequestLoad: pullRequestLoad(),
		pullRequestFetchInFlight: pullRequestFetchInFlight(),
		isLoadingMorePullRequests: isLoadingMorePullRequests(),
		refreshGenerationRef,
		lastPullRequestRefreshAtRef,
		pullRequestStatusRef,
		terminalFocusedRef,
		maybeRefreshPullRequestsRef,
		refreshPullRequestsRef,
		resetHydration,
		resetLoadingMore,
		setPullRequestOverrides,
		setRecentlyCompletedPullRequests,
		setPullRequestComments,
		setPullRequestCommentsLoaded,
		setNotice,
		armRefreshToast,
		refreshPullRequestsAtom,
	})

	useScrollFollowSelected(prListScrollRef, () =>
		pullRequestListRowIndex(
			buildPullRequestListRows({
				groups: visibleGroups(),
				status: pullRequestStatus(),
				error: pullRequestError(),
				filterText: effectiveFilterQuery(),
				loadedCount: loadedPullRequestCount(),
				hasMore: loadMoreSlotAvailable(),
				isLoadingMore: isLoadingMorePullRequests(),
				compact: compactPullRequestRows(),
			}),
			selectedPullRequest()?.url ?? null,
			loadMoreRowSelected(),
		),
	)
	useScrollPersistence(
		prListScrollRef,
		prListScrollPersistedRef,
		() => activeWorkspaceSurface() === "pullRequests" && !detailFullView() && !diffFullView() && !commentsViewActive(),
	)

	const selectPullRequestByUrl = (url: string) => {
		const index = visiblePullRequests().findIndex((pullRequest) => pullRequest.url === url)
		if (index >= 0) {
			setSelectedIndex(index)
			setQueueSelection((current) => ({ ...current, [currentQueueCacheKey()]: index }))
		}
	}

	// `isFullscreen` is provisionally `false` for the PR Surface here — the
	// detail/diff/comments full-view booleans still live in App-shell during
	// the transition.
	const isFullscreen = false

	return {
		isFullscreen,
		pullRequestResult,
		pullRequestStatus,
		pullRequestError,
		pullRequestFetchInFlight,
		isInitialLoading: (startupLoadComplete: boolean) => !startupLoadComplete && pullRequestStatus() === "loading" && pullRequests().length === 0,
		activeView,
		setActiveView,
		activeViews,
		currentQueueCacheKey,
		pullRequestLoad,
		setQueueLoadCache,
		hasMorePullRequests,
		loadedPullRequestCount,
		loadMoreRowSelected,
		loadMoreSlotAvailable,
		pullRequests,
		visiblePullRequests,
		visibleGroups,
		groupStarts,
		selectedPullRequest,
		selectedRepository,
		pullRequestActiveFilterLabel,
		compactPullRequestRows,
		pullRequestListRows,
		selectedPullRequestRowIndex,
		setPullRequestOverrides,
		setRecentlyCompletedPullRequests,
		retryProgress,
		loadMorePullRequests,
		isLoadingMorePullRequests,
		resetLoadingMore,
		armRefreshToast,
		cancelRefreshToast,
		refreshPullRequests,
		detailHydrationState,
		resetHydration,
		selectPullRequestByUrl,
	}
}
