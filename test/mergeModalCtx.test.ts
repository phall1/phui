import { describe, expect, test } from "bun:test"
import { buildMergeModalCtx } from "../src/keymap/contexts/mergeModalCtx.js"
import type { MergeModalState } from "../src/ui/modals/types.js"
import type { PullRequestMergeInfo } from "../src/domain.js"

const cleanInfo: PullRequestMergeInfo = {
	repository: "owner/repo",
	number: 1,
	title: "Test PR",
	state: "open",
	isDraft: false,
	mergeable: "mergeable",
	reviewStatus: "approved",
	checkStatus: "passing",
	checkSummary: "checks 5/5",
	autoMergeEnabled: false,
	viewerCanMergeAsAdmin: false,
	mergeQueueEnabled: false,
}

const baseModal = (overrides: Partial<MergeModalState> = {}): MergeModalState => ({
	repository: "owner/repo",
	number: 1,
	selectedIndex: 0,
	loading: false,
	running: false,
	info: cleanInfo,
	error: null,
	selectedMethod: "squash",
	allowedMethods: { squash: true, merge: true, rebase: true },
	pendingConfirm: null,
	...overrides,
})

const noopFlow = {
	cancelOrCloseMergeModal: () => {},
	confirmMergeAction: () => {},
	cycleMergeMethod: (_delta: -1 | 1) => {},
	moveMergeSelection: (_delta: -1 | 1) => {},
}

describe("buildMergeModalCtx", () => {
	test("counts visible merge actions when status loaded cleanly", () => {
		expect(buildMergeModalCtx({ mergeModal: baseModal(), ...noopFlow }).availableActionCount).toBe(2)
	})

	test("blocks confirm when merge metadata lookup failed", () => {
		const ctx = buildMergeModalCtx({ mergeModal: baseModal({ error: "Fixture queue lookup denied" }), ...noopFlow })
		expect(ctx.availableActionCount).toBe(0)
	})
})
