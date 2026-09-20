import { createEffect, createSignal } from "solid-js"
import { readMaybeAccessor, type MaybeAccessor, type MutableRefObject } from "../../solid-utils.js"
import type { LoadStatus, PullRequestItem } from "../../domain.js"
import type { PullRequestLoad } from "../../pullRequestLoad.js"

export interface UseRefreshCompletionToastInput {
	readonly pullRequestStatus: MaybeAccessor<LoadStatus>
	readonly pullRequestError: MaybeAccessor<string | null>
	readonly fetchedAt: MaybeAccessor<number | undefined>
	readonly pullRequestLoad: MaybeAccessor<PullRequestLoad | null>
	readonly selectedPullRequest: MaybeAccessor<PullRequestItem | null>
	readonly lastPullRequestRefreshAtRef: MutableRefObject<number>
	readonly flashNotice: (message: string) => void
}

export interface UseRefreshCompletionToastResult {
	/** Arm a toast that fires once the next refresh lands successfully (or
	 * "Refresh failed" if it errors). Idempotent — overrides any previous
	 * pending toast message. */
	readonly armRefreshToast: (message: string) => void
	/** Cancel any pending toast — e.g. on view switch where the previous
	 * refresh is no longer the user's focus. */
	readonly cancelRefreshToast: () => void
}

/**
 * Owns the "refresh completed" toast lifecycle: holds the pending message,
 * watches the queue's fetch timestamp for advancement, and flashes once the
 * detail-hydration settles (so we don't flash "Refreshed" while checks are
 * still loading in for the selected row).
 */
export const useRefreshCompletionToast = ({
	pullRequestStatus,
	pullRequestError,
	fetchedAt,
	pullRequestLoad,
	selectedPullRequest,
	lastPullRequestRefreshAtRef,
	flashNotice,
}: UseRefreshCompletionToastInput): UseRefreshCompletionToastResult => {
	const [refreshCompletionMessage, setRefreshCompletionMessage] = createSignal<string | null>(null)
	const [refreshStartedAt, setRefreshStartedAt] = createSignal<number | null>(null)

	const armRefreshToast = (message: string) => {
		setRefreshCompletionMessage(message)
		setRefreshStartedAt(lastPullRequestRefreshAtRef.current)
	}

	const cancelRefreshToast = () => {
		setRefreshCompletionMessage(null)
		setRefreshStartedAt(null)
	}

	createEffect(() => {
		const message = refreshCompletionMessage()
		const startedAt = refreshStartedAt()
		if (!message || startedAt === null) return
		const status = readMaybeAccessor(pullRequestStatus)
		const selected = readMaybeAccessor(selectedPullRequest)
		const isHydratingDetails = status === "ready" && selected?.state === "open" && !selected.detailLoaded
		const fetched = readMaybeAccessor(fetchedAt)
		if (status === "ready" && fetched !== undefined && fetched !== startedAt && !isHydratingDetails) {
			flashNotice(`✓ ${message}`)
			setRefreshCompletionMessage(null)
			setRefreshStartedAt(null)
		} else if (status === "error" || readMaybeAccessor(pullRequestError)) {
			flashNotice(readMaybeAccessor(pullRequestLoad) ? "Refresh failed; showing cached data" : "Refresh failed")
			setRefreshCompletionMessage(null)
			setRefreshStartedAt(null)
		}
	})

	return { armRefreshToast, cancelRefreshToast }
}
