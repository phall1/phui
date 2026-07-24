import { describe, expect, test } from "bun:test"
import { applyLaunchIntent } from "../src/launchBootstrap.ts"
import { expireNotice, NOTICE_TIMEOUT_MS, visibleNoticeAfterInitialLoading } from "../src/ui/notice/lifecycle.ts"

describe("launch failure notice lifecycle", () => {
	test("defers an early failure until loading completes, emits it once, and lets it expire", async () => {
		const failure = "Pull request not found: owner/repo#404"
		let openedRepository: string | null = null
		let notice: string | null = null
		let noticeWrites = 0

		const result = await applyLaunchIntent(
			{ _tag: "PullRequest", repository: "owner/repo", number: 404, view: "details" },
			{
				openRepository: (repository) => {
					openedRepository = repository
				},
				hydratePullRequest: async () => {
					throw new Error(failure)
				},
				selectPullRequest: () => false,
				showNotice: (message) => {
					noticeWrites += 1
					notice = message
				},
			},
		)

		expect(result._tag).toBe("PullRequestFailed")
		expect(openedRepository).toBe("owner/repo")
		expect(noticeWrites).toBe(1)

		const visibleNotices = [visibleNoticeAfterInitialLoading(notice, true), visibleNoticeAfterInitialLoading(notice, false)].filter(
			(message): message is string => message !== null,
		)
		expect(visibleNotices).toEqual([failure])
		expect(NOTICE_TIMEOUT_MS).toBe(2500)

		notice = expireNotice(notice, failure)
		expect(visibleNoticeAfterInitialLoading(notice, false)).toBeNull()
	})
})
