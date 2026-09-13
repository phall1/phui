import { createEffect, onCleanup } from "solid-js"
import { useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import type { PullRequestItem } from "../../domain.js"
import { selectedPullRequestAtom } from "../pullRequests/atoms.js"
import { diffFullViewAtom } from "./atoms.js"

const DEFAULT_DELAY_MS = 250

export interface UseDiffPrefetchInput {
	readonly onPrefetch: (pullRequest: PullRequestItem) => void
	readonly delayMs?: number
}

/**
 * Schedules a delayed diff prefetch for the selected pull request, cancelling
 * any pending prefetch when selection changes or the skip flag flips.
 */
export const useDiffPrefetch = ({ onPrefetch, delayMs = DEFAULT_DELAY_MS }: UseDiffPrefetchInput): void => {
	const pullRequest = useAtomValueSolid(() => selectedPullRequestAtom)
	const diffFullView = useAtomValueSolid(() => diffFullViewAtom)
	createEffect(() => {
		const current = pullRequest()
		if (diffFullView() || !current) return
		const timeout = globalThis.setTimeout(() => onPrefetch(current), delayMs)
		onCleanup(() => globalThis.clearTimeout(timeout))
	})
}
