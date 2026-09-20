import { RegistryContext } from "@effect/atom-solid"
import { Effect } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"
import { type MutableRefObject, useContext, useRef } from "../../solid-utils.js"
import type { LoadStatus, PullRequestItem } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import { pullRequestDetailKey, pullRequestDetailsForRevision, pullRequestRevisionAtomKey } from "./atoms.js"

const DETAIL_PREFETCH_BEHIND = 1
const DETAIL_PREFETCH_AHEAD = 3
const DETAIL_PREFETCH_CONCURRENCY = 3
const DETAIL_PREFETCH_DELAY_MS = 120

export type DetailHydrationState = { readonly _tag: "Loading" } | { readonly _tag: "Error"; readonly message: string }

interface DetailHydration {
	readonly abortController: AbortController
	notifyError: boolean
}

export interface UseDetailHydrationInput {
	readonly selectedPullRequest: Accessor<PullRequestItem | null>
	readonly pullRequestStatus: Accessor<LoadStatus>
	readonly visiblePullRequests: Accessor<readonly PullRequestItem[]>
	readonly selectedIndex: Accessor<number>
	readonly currentQueueCacheKey: Accessor<string>
	readonly refreshGenerationRef: MutableRefObject<number>
	/** Timestamp of the latest queue fetch. When this advances we force-rehydrate
	 * the selected PR so its checks/labels reflect the latest server state. */
	readonly queueFetchedAtMs: Accessor<number | null>
	readonly flashNotice: (message: string) => void
}

export interface UseDetailHydrationResult {
	/** Per-PR loading/error tracking for the selected pane. */
	readonly detailHydrationState: Accessor<Record<string, DetailHydrationState>>
	/** Cancel pending hydrations and clear the prefetch timeout — call on
	 * manual refresh or view switch so we don't apply stale fetches. */
	readonly resetHydration: () => void
}

/**
 * Owns the background "hydrate detail" pipeline. The selected PR is
 * always hydrated (notifyError=true → loading state + flash on error);
 * neighbours within ±DETAIL_PREFETCH_AHEAD/BEHIND are prefetched after
 * a short debounce (notifyError=false → silent).
 *
 * Inputs are accessors and the driving effects are real Solid `createEffect`s,
 * so a change of selected PR (or of the queue's fetchedAt) actually re-runs
 * hydration. Under the previous React-style shim the effects ran once and never
 * re-fired, so detail hydration effectively never happened after first paint.
 */
export const useDetailHydration = (input: UseDetailHydrationInput): UseDetailHydrationResult => {
	const registry = useContext(RegistryContext)

	const [detailHydrationState, setDetailHydrationState] = createSignal<Record<string, DetailHydrationState>>({})
	const [hydrationResetEpoch, setHydrationResetEpoch] = createSignal(0)
	const detailHydrationRef = useRef(new Map<string, DetailHydration>())
	const selectedHydrationKeyRef = useRef<string | null>(null)
	const detailPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	onCleanup(() => {
		if (detailPrefetchTimeoutRef.current !== null) clearTimeout(detailPrefetchTimeoutRef.current)
		for (const entry of detailHydrationRef.current.values()) entry.abortController.abort()
		detailHydrationRef.current.clear()
	})

	const hydratePullRequestDetails = (pullRequest: PullRequestItem, notifyError: boolean, options?: { readonly force?: boolean }): boolean => {
		const detailKey = pullRequestDetailKey(pullRequest)
		const force = options?.force === true
		const forceRefresh = force
		if (pullRequest.detailLoaded && !forceRefresh) return false
		if (notifyError && selectedHydrationKeyRef.current !== detailKey) {
			const previousSelected = selectedHydrationKeyRef.current
			if (previousSelected) detailHydrationRef.current.get(previousSelected)?.abortController.abort()
			selectedHydrationKeyRef.current = detailKey
		}
		const existing = detailHydrationRef.current.get(detailKey)
		if (existing) {
			if (notifyError) existing.notifyError = true
			return false
		}
		if (!notifyError && detailHydrationRef.current.size >= DETAIL_PREFETCH_CONCURRENCY) return false
		const entry: DetailHydration = { abortController: new AbortController(), notifyError }
		detailHydrationRef.current.set(detailKey, entry)
		if (notifyError) setDetailHydrationState((current) => ({ ...current, [detailKey]: { _tag: "Loading" } }))
		const generation = input.refreshGenerationRef.current
		const detailAtom = pullRequestDetailsForRevision(pullRequestRevisionAtomKey(pullRequest))
		if (forceRefresh) registry.refresh(detailAtom)
		void Effect.runPromise(AtomRegistry.getResult(registry, detailAtom, { suspendOnWaiting: true }), { signal: entry.abortController.signal })
			.then(() => {
				if (generation === input.refreshGenerationRef.current && detailHydrationRef.current.get(detailKey) === entry) {
					if (entry.notifyError) {
						setDetailHydrationState((current) => {
							if (!(detailKey in current)) return current
							const next = { ...current }
							delete next[detailKey]
							return next
						})
					}
				}
			})
			.catch((error) => {
				if (entry.abortController.signal.aborted) return
				if (entry.notifyError && generation === input.refreshGenerationRef.current && detailHydrationRef.current.get(detailKey) === entry) {
					const message = errorMessage(error)
					setDetailHydrationState((current) => ({ ...current, [detailKey]: { _tag: "Error", message } }))
					input.flashNotice(message)
				}
			})
			.finally(() => {
				if (detailHydrationRef.current.get(detailKey) === entry) detailHydrationRef.current.delete(detailKey)
			})
		return true
	}

	const resetHydration = () => {
		for (const entry of detailHydrationRef.current.values()) entry.abortController.abort()
		detailHydrationRef.current.clear()
		selectedHydrationKeyRef.current = null
		setDetailHydrationState({})
		setHydrationResetEpoch((current) => current + 1)
		if (detailPrefetchTimeoutRef.current !== null) clearTimeout(detailPrefetchTimeoutRef.current)
	}

	// Hydrate the selected PR with notifyError=true so user sees loading + flash on error.
	// When the queue's `fetchedAt` advances (i.e. the list itself just refreshed),
	// force a re-fetch even if `detailLoaded` is still true — checks may have moved
	// even though the SHA hasn't.
	//
	// Track only the currently-selected (detailKey, fetchedAt) in a single slot
	// rather than a growing Map: we only need to detect "did the queue refresh
	// since we last hydrated *this* PR?" — comparing against a Map keyed by every
	// PR ever selected would slowly leak.
	const lastSelectedRefreshRef = useRef<{ detailKey: string; fetchedAt: number } | null>(null)
	createEffect(() => {
		const status = input.pullRequestStatus()
		const selectedPullRequest = input.selectedPullRequest()
		const queueFetchedAtMs = input.queueFetchedAtMs()
		hydrationResetEpoch()
		if (status !== "ready" || !selectedPullRequest) return
		const detailKey = pullRequestDetailKey(selectedPullRequest)
		const previous = lastSelectedRefreshRef.current
		const queueAdvanced = queueFetchedAtMs !== null && previous !== null && previous.detailKey === detailKey && queueFetchedAtMs > previous.fetchedAt
		if (queueFetchedAtMs !== null) lastSelectedRefreshRef.current = { detailKey, fetchedAt: queueFetchedAtMs }
		hydratePullRequestDetails(selectedPullRequest, true, queueAdvanced ? { force: true } : undefined)
	})

	// Prefetch neighbours around the selected index after a short debounce.
	createEffect(() => {
		const status = input.pullRequestStatus()
		const cacheKey = input.currentQueueCacheKey()
		const selectedIndex = input.selectedIndex()
		const visiblePullRequests = input.visiblePullRequests()
		if (detailPrefetchTimeoutRef.current !== null) clearTimeout(detailPrefetchTimeoutRef.current)
		if (status !== "ready" || visiblePullRequests.length === 0) return
		detailPrefetchTimeoutRef.current = globalThis.setTimeout(() => {
			detailPrefetchTimeoutRef.current = null
			let started = 0
			for (let distance = 1; distance <= Math.max(DETAIL_PREFETCH_AHEAD, DETAIL_PREFETCH_BEHIND); distance++) {
				const offsets = [distance <= DETAIL_PREFETCH_AHEAD ? distance : null, distance <= DETAIL_PREFETCH_BEHIND ? -distance : null]
				for (const offset of offsets) {
					if (offset === null) continue
					if (started >= DETAIL_PREFETCH_CONCURRENCY) return
					const pullRequest = visiblePullRequests[selectedIndex + offset]
					if (pullRequest && hydratePullRequestDetails(pullRequest, false)) started += 1
				}
			}
		}, DETAIL_PREFETCH_DELAY_MS)
		onCleanup(() => {
			if (detailPrefetchTimeoutRef.current !== null) clearTimeout(detailPrefetchTimeoutRef.current)
		})
		// `cacheKey` participates so a view switch re-debounces the prefetch.
		void cacheKey
	})

	return {
		detailHydrationState,
		resetHydration,
	}
}
