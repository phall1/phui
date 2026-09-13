import { describe, expect, test } from "bun:test"
import { matchReviewThread, resolveTargetCommentIds, threadRootCommentId } from "../src/ui/comments/reviewThreads.ts"

const thread = (id: string, rootCommentId: string | null) => ({ id, isResolved: false, rootCommentId })

describe("threadRootCommentId", () => {
	test("prefers the unreplied root over replies", () => {
		expect(
			threadRootCommentId([
				{ id: "2", path: "a.ts", line: 1, side: "RIGHT", author: "a", body: "r", createdAt: null, url: null, inReplyTo: "1" },
				{ id: "1", path: "a.ts", line: 1, side: "RIGHT", author: "a", body: "root", createdAt: null, url: null, inReplyTo: null },
			]),
		).toBe("1")
	})
})

describe("matchReviewThread", () => {
	test("matches the displayed thread root, not a comments-pane cursor", () => {
		const threads = [thread("PRRT_1", "10"), thread("PRRT_2", "20")]
		expect(matchReviewThread(threads, ["10"])?.id).toBe("PRRT_1")
		expect(matchReviewThread(threads, ["99"])).toBeNull()
	})
})

describe("resolveTargetCommentIds", () => {
	test("thread modal root wins over the comments-pane selection", () => {
		expect(resolveTargetCommentIds({ threadModalRootId: "10", selectedOrderedCommentId: "20" })).toEqual(["10"])
		expect(resolveTargetCommentIds({ threadModalRootId: null, selectedOrderedCommentId: "20" })).toEqual(["20"])
		expect(resolveTargetCommentIds({ threadModalRootId: null, selectedOrderedCommentId: null })).toEqual([])
	})
})
