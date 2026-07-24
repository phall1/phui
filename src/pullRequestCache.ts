import type { PullRequestItem } from "./domain.js"
import type { ItemPage } from "./item.js"
import { freshItemLoad, nextItemLoadAfterPage } from "./item/load.js"
import type { PullRequestLoad } from "./pullRequestLoad.js"
import type { PullRequestView } from "./pullRequestViews.js"

const pullRequestQueueKey = (pullRequest: PullRequestItem) => `${pullRequest.repository}\u0000${pullRequest.number}`

const targetedKeys = (load: PullRequestLoad | undefined): readonly string[] => load?.targetedPullRequestKeys ?? []

const targetedPullRequestKeysOnPage = (existing: PullRequestLoad | undefined, items: readonly PullRequestItem[]): ReadonlySet<string> | undefined => {
	const keys = targetedKeys(existing)
	if (keys.length === 0) return undefined

	const targeted = new Set(keys)
	const keysOnPage = new Set<string>()
	for (const pullRequest of items) {
		const key = pullRequestQueueKey(pullRequest)
		if (targeted.has(key)) keysOnPage.add(key)
	}
	return keysOnPage.size === 0 ? undefined : keysOnPage
}

const preserveTargetedPullRequests = (load: PullRequestLoad, existing: PullRequestLoad | undefined, authoritativeTargetKeys: ReadonlySet<string> | undefined): PullRequestLoad => {
	const keys = targetedKeys(existing)
	if (keys.length === 0 || load.view._tag !== "Repository" || existing?.view._tag !== "Repository" || load.view.repository !== existing.view.repository) return load

	const targeted = new Set(keys)
	const existingTargets = new Map(
		existing.data.filter((pullRequest) => targeted.has(pullRequestQueueKey(pullRequest))).map((pullRequest) => [pullRequestQueueKey(pullRequest), pullRequest]),
	)
	const seen = new Set(load.data.map(pullRequestQueueKey))
	const appendedTargets: PullRequestItem[] = []
	const unmatchedKeys: string[] = []
	for (const key of keys) {
		if (authoritativeTargetKeys?.has(key)) continue
		const pullRequest = existingTargets.get(key)
		if (!pullRequest || pullRequest.repository !== load.view.repository) continue
		unmatchedKeys.push(key)
		if (seen.has(key)) continue
		appendedTargets.push(pullRequest)
		seen.add(key)
	}

	const data = appendedTargets.length === 0 ? load.data : [...load.data, ...appendedTargets]
	const currentKeys = load.targetedPullRequestKeys
	if (appendedTargets.length === 0 && currentKeys !== undefined && currentKeys.length === unmatchedKeys.length && currentKeys.every((key, index) => key === unmatchedKeys[index]))
		return load
	if (unmatchedKeys.length > 0) return { ...load, data, targetedPullRequestKeys: unmatchedKeys }
	if (currentKeys === undefined) return load
	return {
		view: load.view,
		data,
		fetchedAt: load.fetchedAt,
		endCursor: load.endCursor,
		hasNextPage: load.hasNextPage,
	}
}

export const installTargetedPullRequest = (existing: PullRequestLoad | undefined, pullRequest: PullRequestItem): PullRequestLoad => {
	const view = { _tag: "Repository", repository: pullRequest.repository } as const
	const repositoryLoad = existing?.view._tag === "Repository" && existing.view.repository === pullRequest.repository ? existing : undefined
	const key = pullRequestQueueKey(pullRequest)
	const data = [...(repositoryLoad?.data ?? [])]
	const existingIndex = data.findIndex((item) => pullRequestQueueKey(item) === key)
	if (existingIndex < 0) data.push(pullRequest)
	else data[existingIndex] = pullRequest

	const load: PullRequestLoad = {
		view,
		data,
		fetchedAt: repositoryLoad?.fetchedAt ?? null,
		endCursor: repositoryLoad?.endCursor ?? null,
		hasNextPage: repositoryLoad?.hasNextPage ?? false,
	}
	const existingTargetedKeys = targetedKeys(repositoryLoad)
	const nextTargetedKeys = existingIndex < 0 ? [...new Set([...existingTargetedKeys, key])] : existingTargetedKeys
	return nextTargetedKeys.length === 0 ? load : { ...load, targetedPullRequestKeys: nextTargetedKeys }
}

export const pullRequestLoadForPersistence = (load: PullRequestLoad): PullRequestLoad => {
	if (!load.targetedPullRequestKeys || load.targetedPullRequestKeys.length === 0) return load
	const targeted = new Set(load.targetedPullRequestKeys)
	return {
		view: load.view,
		data: load.data.filter((pullRequest) => !targeted.has(pullRequestQueueKey(pullRequest))),
		fetchedAt: load.fetchedAt,
		endCursor: load.endCursor,
		hasNextPage: load.hasNextPage,
	}
}

export const pullRequestQueueItemCount = (load: PullRequestLoad): number => {
	if (!load.targetedPullRequestKeys || load.targetedPullRequestKeys.length === 0) return load.data.length
	const targeted = new Set(load.targetedPullRequestKeys)
	return load.data.reduce((count, pullRequest) => count + (targeted.has(pullRequestQueueKey(pullRequest)) ? 0 : 1), 0)
}

// When a fresh summary page arrives, fold in fields that only the detail
// query carries (body, labels, line counts, status checks) from a cached
// detail-loaded copy at the *same* SHA. Otherwise the row would lose its
// detail every refresh: the summary fragment omits `statusCheckRollup`, so
// without this merge the cached `✓`/`✗` icons would revert to blank on every
// page fetch, and hydration would refuse to rerun because `detailLoaded` is
// still true.
export const mergeCachedDetails = (fresh: readonly PullRequestItem[], cached: readonly PullRequestItem[] | undefined) => {
	if (!cached) return fresh
	const cachedByUrl = new Map(cached.map((pullRequest) => [pullRequest.url, pullRequest]))
	return fresh.map((pullRequest) => {
		const cachedPullRequest = cachedByUrl.get(pullRequest.url)
		if (!cachedPullRequest?.detailLoaded || cachedPullRequest.headRefOid !== pullRequest.headRefOid) return pullRequest
		return mergePullRequestDetail(pullRequest, cachedPullRequest)
	})
}

export const mergePullRequestDetail = (summary: PullRequestItem, detail: PullRequestItem): PullRequestItem => ({
	...summary,
	body: detail.body,
	labels: detail.labels,
	additions: detail.additions,
	deletions: detail.deletions,
	changedFiles: detail.changedFiles,
	checkStatus: detail.checkStatus,
	checkSummary: detail.checkSummary,
	checks: detail.checks,
	detailLoaded: true,
})

export const freshPullRequestLoad = (
	view: PullRequestView,
	page: ItemPage<PullRequestItem>,
	existing: PullRequestLoad | undefined,
	prFetchLimit: number,
	fetchedAt: Date = new Date(),
): PullRequestLoad => {
	const authoritativeTargetKeys = targetedPullRequestKeysOnPage(existing, page.items)
	const fresh = freshItemLoad(view, page, (items) => mergeCachedDetails(items, existing?.data), prFetchLimit, fetchedAt)
	return preserveTargetedPullRequests(fresh, existing, authoritativeTargetKeys)
}

export const nextLoadAfterPage = (current: PullRequestLoad, page: ItemPage<PullRequestItem>, prFetchLimit: number, fetchedAt: Date = new Date()): PullRequestLoad => {
	const authoritativeTargetKeys = targetedPullRequestKeysOnPage(current, page.items)
	const paginationBase =
		authoritativeTargetKeys === undefined ? current : { ...current, data: current.data.filter((pullRequest) => !authoritativeTargetKeys.has(pullRequestQueueKey(pullRequest))) }
	const next = preserveTargetedPullRequests(
		nextItemLoadAfterPage(
			paginationBase,
			page,
			prFetchLimit,
			(pullRequest) => pullRequest.url,
			(incoming) => mergeCachedDetails(incoming, current.data),
			fetchedAt,
		),
		current,
		authoritativeTargetKeys,
	)
	const cursorAdvanced = page.endCursor !== null && page.endCursor !== current.endCursor
	return {
		...next,
		hasNextPage: page.hasNextPage && cursorAdvanced && pullRequestQueueItemCount(next) < prFetchLimit,
	}
}
