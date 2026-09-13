import { describe, expect, test } from "bun:test"
import { formatSequence } from "@phui/keymap"
import { commentModalKeymap } from "../src/keymap/commentModal.ts"

describe("comment modal keymap", () => {
	test("ctrl+return queues a pending review comment", () => {
		const calls: string[] = []
		const binding = commentModalKeymap.bindings.find((entry) => formatSequence(entry.sequence) === "ctrl+return")
		expect(binding).toBeDefined()
		expect(binding?.meta?.id).toBe("comment.queue")
		binding!.action({
			closeModal: () => calls.push("close"),
			queueComment: () => calls.push("queue"),
		})
		expect(calls).toEqual(["queue"])
	})
})
