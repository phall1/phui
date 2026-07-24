import { describe, expect, test } from "bun:test"
import type { PullRequestItem } from "../src/domain.ts"
import { applyLaunchIntent, pullRequestLaunchViewState, type LaunchBootstrapActions } from "../src/launchBootstrap.ts"

const pullRequest = (overrides: Partial<PullRequestItem> = {}): PullRequestItem => ({
	repository: "owner/repo",
	author: "author",
	headRefOid: "abc123",
	headRefName: "feature/bootstrap",
	baseRefName: "main",
	defaultBranchName: "main",
	number: 42,
	title: "Targeted pull request",
	body: "Hydrated body",
	labels: [],
	additions: 10,
	deletions: 2,
	changedFiles: 3,
	state: "open",
	reviewStatus: "none",
	checkStatus: "passing",
	checkSummary: "1/1",
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-02T00:00:00Z"),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/42",
	...overrides,
})

const unusedActions = (calls: string[]): LaunchBootstrapActions => ({
	openRepository: () => calls.push("open"),
	hydratePullRequest: async () => {
		calls.push("hydrate")
		return pullRequest()
	},
	selectPullRequest: () => {
		calls.push("select")
		return true
	},
	showNotice: () => calls.push("notice"),
})

describe("pullRequestLaunchViewState", () => {
	test("maps each requested launch view to exactly one full-screen state", () => {
		expect(pullRequestLaunchViewState("details")).toEqual({ detailFullView: true, diffFullView: false, commentsViewActive: false, runsFullView: false })
		expect(pullRequestLaunchViewState("diff")).toEqual({ detailFullView: false, diffFullView: true, commentsViewActive: false, runsFullView: false })
		expect(pullRequestLaunchViewState("comments")).toEqual({ detailFullView: false, diffFullView: false, commentsViewActive: true, runsFullView: false })
		expect(pullRequestLaunchViewState("runs")).toEqual({ detailFullView: false, diffFullView: false, commentsViewActive: false, runsFullView: true })
	})
})

describe("applyLaunchIntent", () => {
	test("Default changes nothing", async () => {
		const calls: string[] = []

		const result = await applyLaunchIntent({ _tag: "Default" }, unusedActions(calls))

		expect(result).toEqual({ _tag: "Default" })
		expect(calls).toEqual([])
	})

	test("Repository opens repository scope without hydrating a pull request", async () => {
		const calls: string[] = []

		const result = await applyLaunchIntent({ _tag: "Repository", repository: "owner/repo" }, unusedActions(calls))

		expect(result).toEqual({ _tag: "RepositoryReady", repository: "owner/repo" })
		expect(calls).toEqual(["open"])
	})

	test("publishes selection before returning the requested PR view", async () => {
		const calls: string[] = []
		const target = pullRequest()
		const result = await applyLaunchIntent(
			{ _tag: "PullRequest", repository: "owner/repo", number: 42, view: "diff" },
			{
				openRepository: (repository) => calls.push(`open:${repository}`),
				hydratePullRequest: async () => {
					calls.push("hydrate")
					return target
				},
				selectPullRequest: (pullRequest) => {
					calls.push(`select:${pullRequest.number}`)
					return true
				},
				showNotice: (message) => calls.push(`notice:${message}`),
			},
		)

		expect(calls).toEqual(["open:owner/repo", "hydrate", "select:42"])
		expect(result).toEqual({ _tag: "PullRequestReady", pullRequest: target, view: "diff" })
	})

	test("turns a targeted fetch error into a nonfatal notice", async () => {
		const calls: string[] = []
		const result = await applyLaunchIntent(
			{ _tag: "PullRequest", repository: "owner/repo", number: 404, view: "details" },
			{
				openRepository: (repository) => calls.push(`open:${repository}`),
				hydratePullRequest: async () => {
					calls.push("hydrate")
					throw new Error("Pull request not found: owner/repo#404")
				},
				selectPullRequest: () => {
					calls.push("select")
					return true
				},
				showNotice: (message) => calls.push(`notice:${message}`),
			},
		)

		expect(calls).toEqual(["open:owner/repo", "hydrate", "notice:Pull request not found: owner/repo#404"])
		expect(result).toEqual({
			_tag: "PullRequestFailed",
			repository: "owner/repo",
			number: 404,
			error: "Pull request not found: owner/repo#404",
		})
	})
})
