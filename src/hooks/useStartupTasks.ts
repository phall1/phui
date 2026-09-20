import { createEffect } from "solid-js"
import { readMaybeAccessor, type MaybeAccessor } from "../solid-utils.js"
import { devLog } from "../devLog.js"
import type { IssueItem, PullRequestItem } from "../domain.js"
import type { RepoRollupRow } from "../services/CacheService.js"

interface PullRequestLoadShape {
	readonly fetchedAt?: Date | null
}

interface IssueLoadShape {
	readonly fetchedAt?: Date | null
}

export interface UseStartupTasksInput {
	readonly username: MaybeAccessor<string | null>
	readonly recentRepositories: MaybeAccessor<readonly string[]>
	readonly favoriteRepositories: MaybeAccessor<Readonly<Record<string, boolean>>>
	readonly detectedRepository: MaybeAccessor<string | null>
	readonly pullRequestLoad: MaybeAccessor<PullRequestLoadShape | null>
	readonly issueLoad: MaybeAccessor<IssueLoadShape | null>
	readonly currentQueueCacheKey: MaybeAccessor<string>
	readonly selectedIndex: MaybeAccessor<number>
	readonly persistQueueSelection: MaybeAccessor<boolean>
	readonly readRepoRollup: (username: string) => Promise<readonly RepoRollupRow[]>
	readonly setRepoRollup: (rows: readonly RepoRollupRow[]) => void
	readonly prewarmRepositoryDetails: (repositories: readonly string[]) => Promise<unknown>
	readonly pruneCache: () => Promise<unknown>
	readonly setQueueSelection: (next: (prev: Partial<Record<string, number>>) => Partial<Record<string, number>>) => void
	readonly issues: readonly IssueItem[]
	readonly pullRequests: readonly PullRequestItem[]
}

void {} as IssueItem | PullRequestItem | undefined

/**
 * Side-effects that fire on mount or in response to user-state changes:
 *   - Hydrate the cached repo rollup so the Repos tab renders before
 *     live PR/issue queries return.
 *   - Background-prewarm `repository_details` for the user's repo set.
 *   - One-shot cache prune at startup (keeps offline-only sessions bounded).
 *   - Persist queue selection per cache key so PR list scroll position
 *     restores when switching between views.
 */
export const useStartupTasks = (input: UseStartupTasksInput): void => {
	createEffect(() => {
		void input.pruneCache().catch((cause) => devLog("useStartupTasks:pruneCacheFailed", { cause: String(cause) }))
	})

	createEffect(() => {
		const username = readMaybeAccessor(input.username)
		void readMaybeAccessor(input.pullRequestLoad)?.fetchedAt
		void readMaybeAccessor(input.issueLoad)?.fetchedAt
		if (!username) return
		void input
			.readRepoRollup(username)
			.then((rows) => input.setRepoRollup(rows))
			.catch((cause) => devLog("useStartupTasks:readRepoRollupFailed", { username, cause: String(cause) }))
	})

	createEffect(() => {
		const username = readMaybeAccessor(input.username)
		if (!username) return
		const recentRepositories = readMaybeAccessor(input.recentRepositories)
		const favoriteRepositories = readMaybeAccessor(input.favoriteRepositories)
		const detectedRepository = readMaybeAccessor(input.detectedRepository)
		const repositories = Array.from(new Set([...recentRepositories, ...Object.keys(favoriteRepositories), ...(detectedRepository ? [detectedRepository] : [])]))
		if (repositories.length === 0) return
		void input.prewarmRepositoryDetails(repositories).catch((cause) => devLog("useStartupTasks:prewarmFailed", { repositories, cause: String(cause) }))
	})

	createEffect(() => {
		if (!readMaybeAccessor(input.persistQueueSelection)) return
		const currentQueueCacheKey = readMaybeAccessor(input.currentQueueCacheKey)
		const selectedIndex = readMaybeAccessor(input.selectedIndex)
		input.setQueueSelection((current) => (current[currentQueueCacheKey] === selectedIndex ? current : { ...current, [currentQueueCacheKey]: selectedIndex }))
	})
}
