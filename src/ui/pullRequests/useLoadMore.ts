import { useAtomSet as useAtomSetSolid } from "@effect/atom-solid"
import { useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { type Accessor } from "solid-js"
import type { MutableRefObject } from "../../solid-utils.js"
import { config } from "../../config.js"
import { useItemLoadMore } from "../../hooks/useItemLoadMore.js"
import { itemQueueCacheViewer } from "../../item/queue.js"
import type { PullRequestLoad } from "../../pullRequestLoad.js"
import { pullRequestQueueItemCount } from "../../pullRequestCache.js"
import { type PullRequestView, viewToListInput } from "../../pullRequestViews.js"
import { pullRequestPageSize } from "../../services/runtime.js"
import { listOpenPullRequestPageAtom, loadingMoreKeyAtom, nextLoadAfterPage, writeQueueCacheAtom } from "./atoms.js"

export interface UseLoadMoreInput {
	readonly activeView: PullRequestView
	readonly currentQueueCacheKey: string
	readonly pullRequestLoad: PullRequestLoad | null
	readonly hasMorePullRequests: boolean
	readonly pullRequestFetchInFlight: boolean
	readonly username: string | null
	readonly refreshGenerationRef: MutableRefObject<number>
	readonly flashNotice: (message: string) => void
	readonly setQueueLoadCache: (next: (prev: Partial<Record<string, PullRequestLoad>>) => Partial<Record<string, PullRequestLoad>>) => void
}

export interface UseLoadMoreResult {
	/** Fire a "load more" page fetch. Returns false if a fetch couldn't start
	 * (already loading, no more pages, no cursor, or limit reached). */
	readonly loadMorePullRequests: () => boolean
	/** Whether a load-more for the active queue cache key is in flight. */
	readonly isLoadingMorePullRequests: Accessor<boolean>
	/** Reset on view switch / hard refresh so a stale "loading more" never
	 * sticks on a queue the user has navigated away from. */
	readonly resetLoadingMore: () => void
}

/**
 * Typed Pull Request adapter for the shared Item load-more state machine.
 * Pull Request query construction, detail-preserving merge, and persistence
 * remain local to this Surface.
 */
export const useLoadMore = ({
	activeView,
	currentQueueCacheKey,
	pullRequestLoad,
	hasMorePullRequests,
	pullRequestFetchInFlight,
	username,
	refreshGenerationRef,
	flashNotice,
	setQueueLoadCache,
}: UseLoadMoreInput): UseLoadMoreResult => {
	const loadPullRequestPage = useAtomSetSolid(() => listOpenPullRequestPageAtom, { mode: "promise" })
	const writeQueueCache = useAtomSetSolid(() => writeQueueCacheAtom, { mode: "promise" })
	const loadingMoreKey = useAtomValueSolid(() => loadingMoreKeyAtom)
	const setLoadingMoreKey = useAtomSetSolid(() => loadingMoreKeyAtom)
	const targetedPullRequestCount = pullRequestLoad ? pullRequestLoad.data.length - pullRequestQueueItemCount(pullRequestLoad) : 0
	const { loadMore, isLoadingMore, resetLoadingMore } = useItemLoadMore({
		cacheKey: currentQueueCacheKey,
		load: pullRequestLoad,
		hasMore: hasMorePullRequests,
		fetchInFlight: pullRequestFetchInFlight,
		itemLimit: config.prFetchLimit + targetedPullRequestCount,
		pageSize: pullRequestPageSize,
		refreshGenerationRef,
		loadingMoreKey,
		setLoadingMoreKey,
		fetchPage: (cursor, pageSize) => loadPullRequestPage(viewToListInput(activeView, cursor, pageSize)),
		mergePage: (current, page) => nextLoadAfterPage(current, page, config.prFetchLimit),
		setLoadCache: setQueueLoadCache,
		persistLoad: (load) => {
			const viewer = itemQueueCacheViewer(activeView, username)
			if (viewer) return writeQueueCache({ viewer, load })
		},
		flashNotice,
		timeoutMessage: "Load more timed out after 15s",
	})

	return { loadMorePullRequests: loadMore, isLoadingMorePullRequests: isLoadingMore, resetLoadingMore }
}
