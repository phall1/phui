import { describe, expect, test } from "bun:test"
import { formatSequence } from "@phui/keymap"
import { commentThreadModalKeymap } from "../src/keymap/commentThreadModal.ts"
import { buildCommentThreadModalCtx } from "../src/keymap/contexts/commentThreadModalCtx.ts"

describe("comment thread modal keymap", () => {
	test("t resolves the displayed thread via review.toggle-thread", () => {
		const called: string[] = []
		const ctx = buildCommentThreadModalCtx({
			halfPage: 4,
			closeActiveModal: () => called.push("close"),
			openDiffCommentModal: () => called.push("reply"),
			scrollCommentThread: () => called.push("scroll"),
			toggleResolve: () => called.push("review.toggle-thread"),
		})
		const binding = commentThreadModalKeymap.bindings.find((entry) => formatSequence(entry.sequence) === "t")
		expect(binding).toBeDefined()
		expect(binding?.meta?.id).toBe("comment-thread.resolve")
		binding!.action(ctx)
		expect(called).toEqual(["review.toggle-thread"])
	})

	test("the app keymap wires t to the thread-root toggle command", async () => {
		const keymapSource = await Bun.file(new URL("../src/hooks/useAppKeymap.ts", import.meta.url)).text()
		expect(keymapSource).toContain('toggleResolve: () => i.runCommandById("review.toggle-thread")')
		const footerSource = await Bun.file(new URL("../src/ui/modals/CommentThreadModal.tsx", import.meta.url)).text()
		expect(footerSource).toContain('key: "t"')
		expect(footerSource).toContain('label: "resolve"')
	})
})
