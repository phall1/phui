import { describe, expect, test } from "bun:test"
import type { PullRequestItem } from "../src/domain.ts"
import {
	freshPullRequestLoad,
	installTargetedPullRequest,
	mergeCachedDetails,
	mergePullRequestDetail,
	nextLoadAfterPage,
	pullRequestLoadForPersistence,
	pullRequestQueueItemCount,
} from "../src/pullRequestCache.ts"
import { findLaunchPullRequestIndex } from "../src/launchBootstrap.ts"

const pullRequest = (overrides: Partial<PullRequestItem> = {}): PullRequestItem => ({
	repository: "owner/repo",
	author: "author",
	headRefOid: "abc123",
	headRefName: "feature/checks",
	baseRefName: "main",
	defaultBranchName: "main",
	number: 1,
	title: "Update checks",
	body: "",
	labels: [],
	additions: 0,
	deletions: 0,
	changedFiles: 0,
	state: "open",
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: false,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/1",
	...overrides,
})

describe("mergeCachedDetails", () => {
	test("hydrates detail fields without replacing authoritative summary metadata", () => {
		const summary = pullRequest({ title: "Current title", updatedAt: new Date("2026-01-01T00:00:00Z"), reviewStatus: "approved" })
		const detail = pullRequest({
			title: "Fallback detail title",
			body: "Hydrated body",
			updatedAt: new Date("2026-06-01T00:00:00Z"),
			reviewStatus: "none",
			additions: 12,
			detailLoaded: true,
		})

		const merged = mergePullRequestDetail(summary, detail)

		expect(merged.title).toBe("Current title")
		expect(merged.updatedAt).toEqual(new Date("2026-01-01T00:00:00Z"))
		expect(merged.reviewStatus).toBe("approved")
		expect(merged.body).toBe("Hydrated body")
		expect(merged.additions).toBe(12)
		expect(merged.detailLoaded).toBe(true)
	})

	test("preserves cached checks because the summary fragment never carries a real rollup", () => {
		// The list query omits `statusCheckRollup` for cost; a fresh "summary" PR
		// always lands with checkStatus = "none". Merging the cached detail's
		// checks back in is what keeps the row's ✓/✗ icon stable across refreshes.
		const cached = pullRequest({
			body: "cached body",
			additions: 10,
			deletions: 2,
			changedFiles: 3,
			checkStatus: "pending",
			checkSummary: "checks 8/9",
			checks: [{ name: "ci", status: "in_progress", conclusion: null }],
			detailLoaded: true,
		})
		const fresh = pullRequest({
			title: "Updated title",
			checkStatus: "none",
			checkSummary: null,
			checks: [],
			detailLoaded: false,
		})

		const [merged] = mergeCachedDetails([fresh], [cached])

		expect(merged).toMatchObject({
			title: "Updated title",
			body: "cached body",
			additions: 10,
			deletions: 2,
			changedFiles: 3,
			checkStatus: "pending",
			checkSummary: "checks 8/9",
			checks: [{ name: "ci", status: "in_progress", conclusion: null }],
			detailLoaded: true,
		})
	})

	test("preserves cached checks across many refreshes (regression: vanishing check icons)", () => {
		const cached = pullRequest({
			checkStatus: "passing",
			checkSummary: "9/9",
			checks: [{ name: "ci", status: "completed", conclusion: "success" }],
			detailLoaded: true,
		})
		const fresh = pullRequest({ checkStatus: "none", checkSummary: null, checks: [], detailLoaded: false })
		const [first] = mergeCachedDetails([fresh], [cached])
		const [second] = mergeCachedDetails([fresh], [first!])
		const [third] = mergeCachedDetails([fresh], [second!])
		expect(third).toMatchObject({ checkStatus: "passing", checkSummary: "9/9", detailLoaded: true })
	})

	test("does not preserve cached details after the pull request head changes", () => {
		const cached = pullRequest({
			headRefOid: "old-sha",
			body: "cached body",
			detailLoaded: true,
		})
		const fresh = pullRequest({
			headRefOid: "new-sha",
			body: "",
			detailLoaded: false,
		})

		const [merged] = mergeCachedDetails([fresh], [cached])

		expect(merged).toMatchObject({
			headRefOid: "new-sha",
			body: "",
			detailLoaded: false,
		})
	})
})

describe("freshPullRequestLoad", () => {
	test("accepts an authoritative empty refresh over cached rows", () => {
		const view = { _tag: "Repository", repository: "owner/repo" } as const
		const previous = { view, data: [pullRequest()], fetchedAt: new Date(), endCursor: "cursor", hasNextPage: false }
		const next = freshPullRequestLoad(view, { items: [], endCursor: null, hasNextPage: false }, previous, 500)

		expect(next.data).toEqual([])
	})
})

describe("targeted pull request installation", () => {
	test("injects and selects an out-of-queue pull request under its repository view", () => {
		const target = pullRequest({
			number: 99,
			url: "https://github.com/owner/repo/pull/99",
			title: "Direct target",
			detailLoaded: true,
		})

		const installed = installTargetedPullRequest(undefined, target)
		const selectedIndex = findLaunchPullRequestIndex(installed.data, target)

		expect(installed.view).toEqual({ _tag: "Repository", repository: "owner/repo" })
		expect(selectedIndex).toBe(0)
		expect(installed.data[selectedIndex]).toBe(target)
	})

	test("preserves cached entries and deduplicates a targeted pull request", () => {
		const view = { _tag: "Repository", repository: "owner/repo" } as const
		const cached = pullRequest({ number: 1 })
		const target = pullRequest({
			number: 99,
			url: "https://github.com/owner/repo/pull/99",
			title: "Initial target",
			detailLoaded: true,
		})
		const existing = { view, data: [cached], fetchedAt: new Date("2026-01-01T00:00:00Z"), endCursor: "cursor", hasNextPage: true }
		const installed = installTargetedPullRequest(existing, target)
		const updated = installTargetedPullRequest(installed, { ...target, title: "Updated target" })

		expect(updated.data.map((pullRequest) => pullRequest.number)).toEqual([1, 99])
		expect(updated.data[0]).toBe(cached)
		expect(updated.data[1]?.title).toBe("Updated target")
		expect(updated.targetedPullRequestKeys).toHaveLength(1)
	})

	test("keeps an injected target when a concurrent first-page publication omits it", () => {
		const view = { _tag: "Repository", repository: "owner/repo" } as const
		const stale = pullRequest({ number: 1, title: "Stale summary" })
		const target = pullRequest({
			number: 99,
			url: "https://github.com/owner/repo/pull/99",
			title: "Direct target",
			detailLoaded: true,
		})
		const installed = installTargetedPullRequest({ view, data: [stale], fetchedAt: new Date("2026-01-01T00:00:00Z"), endCursor: null, hasNextPage: false }, target)
		const refreshed = freshPullRequestLoad(
			view,
			{ items: [pullRequest({ number: 2, url: "https://github.com/owner/repo/pull/2" })], endCursor: null, hasNextPage: false },
			installed,
			500,
		)

		expect(refreshed.data.map((pullRequest) => pullRequest.number)).toEqual([2, 99])
		expect(refreshed.data.find((pullRequest) => pullRequest.number === 99)?.detailLoaded).toBe(true)
	})

	test("does not persist an injected target as if it matched the saved queue", () => {
		const view = { _tag: "Repository", repository: "owner/repo" } as const
		const cached = pullRequest({ number: 1 })
		const target = pullRequest({ number: 99, url: "https://github.com/owner/repo/pull/99", detailLoaded: true })
		const installed = installTargetedPullRequest({ view, data: [cached], fetchedAt: new Date("2026-01-01T00:00:00Z"), endCursor: null, hasNextPage: false }, target)

		const persistent = pullRequestLoadForPersistence(installed)

		expect(persistent.data).toEqual([cached])
		expect(persistent.targetedPullRequestKeys).toBeUndefined()
	})

	test("persists a targeted detail when the PR already matched the repository queue", () => {
		const view = { _tag: "Repository", repository: "owner/repo" } as const
		const summary = pullRequest({ title: "Queue summary" })
		const detail = pullRequest({ title: "Hydrated target", detailLoaded: true })
		const installed = installTargetedPullRequest({ view, data: [summary], fetchedAt: new Date("2026-01-01T00:00:00Z"), endCursor: null, hasNextPage: false }, detail)

		const persistent = pullRequestLoadForPersistence(installed)

		expect(installed.targetedPullRequestKeys).toBeUndefined()
		expect(persistent.data).toEqual([detail])
	})
	test("unpins a deep-linked target when a later page makes it authoritative", () => {
		const view = { _tag: "Repository", repository: "owner/repo" } as const
		const target = pullRequest({
			number: 99,
			url: "https://github.com/owner/repo/pull/99",
			title: "Direct target",
			body: "Hydrated target body",
			additions: 12,
			detailLoaded: true,
		})
		const otherTarget = pullRequest({
			number: 100,
			url: "https://github.com/owner/repo/pull/100",
			title: "Other direct target",
			detailLoaded: true,
		})
		const firstPage = freshPullRequestLoad(view, { items: [pullRequest()], endCursor: "cursor-1", hasNextPage: true }, undefined, 3)
		const withTarget = installTargetedPullRequest(firstPage, target)
		const installed = installTargetedPullRequest(withTarget, otherTarget)
		const [targetKey] = withTarget.targetedPullRequestKeys ?? []

		const next = nextLoadAfterPage(
			installed,
			{
				items: [
					pullRequest({ number: 99, url: "https://github.com/owner/repo/pull/99", title: "Queue target" }),
					pullRequest({ number: 2, url: "https://github.com/owner/repo/pull/2" }),
				],
				endCursor: "cursor-2",
				hasNextPage: true,
			},
			3,
		)
		const persistent = pullRequestLoadForPersistence(next)
		const matches = next.data.filter((pullRequest) => pullRequest.number === 99)

		expect(targetKey).toBeDefined()
		expect(next.targetedPullRequestKeys).toEqual(installed.targetedPullRequestKeys?.slice(1))
		expect(next.targetedPullRequestKeys).not.toContain(targetKey)
		expect(matches).toHaveLength(1)
		expect(matches[0]).toMatchObject({
			title: "Queue target",
			body: "Hydrated target body",
			additions: 12,
			detailLoaded: true,
		})
		expect(persistent.data.map((pullRequest) => pullRequest.number)).toEqual([1, 99, 2])
		expect(persistent.targetedPullRequestKeys).toBeUndefined()
		expect(pullRequestQueueItemCount(next)).toBe(3)
		expect(next.endCursor).toBe("cursor-2")
		expect(next.hasNextPage).toBe(false)
	})
})
