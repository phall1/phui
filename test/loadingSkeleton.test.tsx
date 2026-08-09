import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"

beforeAll(() => {
	// @ts-expect-error — globalThis.IS_REACT_ACT_ENVIRONMENT
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
})
import { buildPullRequestListRows } from "../src/ui/PullRequestList.tsx"
import { shimmerHead, shimmerIntensity, SHIMMER_TAIL } from "../src/ui/shimmer.ts"
import { skeletonRowCountForHeight, skeletonVisualLines } from "../src/ui/SkeletonRows.tsx"

describe("shimmer", () => {
	test("peaks at the head and fades over the tail", () => {
		const width = 20
		const head = shimmerHead(10, width)
		expect(shimmerIntensity(head, 10, width)).toBe(1)
		expect(shimmerIntensity(head - SHIMMER_TAIL, 10, width)).toBe(0)
		expect(shimmerIntensity(head - 1, 10, width)).toBeGreaterThan(shimmerIntensity(head - 2, 10, width))
	})

	test("leaves columns ahead of the head dark", () => {
		const width = 20
		const head = shimmerHead(4, width)
		expect(shimmerIntensity(head + 1, 4, width)).toBe(0)
	})

	test("enters from the left rather than materialising mid-band", () => {
		expect(shimmerHead(0, 20)).toBe(-SHIMMER_TAIL)
	})

	test("cycles without ever leaving the 0..1 range", () => {
		for (let frame = 0; frame < 200; frame++) {
			for (let column = 0; column < 24; column++) {
				const intensity = shimmerIntensity(column, frame, 24)
				expect(intensity).toBeGreaterThanOrEqual(0)
				expect(intensity).toBeLessThanOrEqual(1)
			}
		}
	})
})

describe("skeleton sizing", () => {
	test("fills the pane it was given", () => {
		expect(skeletonVisualLines(skeletonRowCountForHeight(21, false), false)).toBeLessThanOrEqual(21)
		expect(skeletonVisualLines(skeletonRowCountForHeight(21, true), true)).toBeLessThanOrEqual(21)
	})

	test("always leaves at least one row", () => {
		expect(skeletonRowCountForHeight(1, false)).toBe(1)
		expect(skeletonRowCountForHeight(0, true)).toBe(1)
	})
})

describe("buildPullRequestListRows", () => {
	test("reserves skeleton rows instead of a loading message when the list is empty", () => {
		const rows = buildPullRequestListRows({
			groups: [],
			status: "loading",
			error: null,
			filterText: "",
			loadedCount: 0,
			hasMore: false,
			isLoadingMore: false,
			showTitle: false,
			skeletonRowCount: 5,
		})

		expect(rows).toEqual([{ _tag: "skeleton", rowCount: 5, compact: false }])
	})

	test("keeps loaded rows visible while a refresh is in flight", () => {
		const rows = buildPullRequestListRows({
			groups: [["owner/repo", []]],
			status: "loading",
			error: null,
			filterText: "",
			loadedCount: 0,
			hasMore: false,
			isLoadingMore: false,
			showTitle: false,
		})

		expect(rows.some((row) => row._tag === "skeleton")).toBe(true)
	})
})

describe("skeleton rendering", () => {
	test("draws placeholder bars across the pane", async () => {
		const { createTestRenderer } = await import("@opentui/core/testing")
		const { createRoot } = await import("@opentui/react")
		const { SkeletonList } = await import("../src/ui/SkeletonRows.tsx")

		const setup = await createTestRenderer({ width: 60, height: 10 })
		const root = createRoot(setup.renderer)
		act(() => {
			root.render(<SkeletonList contentWidth={58} rowCount={3} compact />)
		})
		await act(async () => {
			await setup.renderOnce()
		})

		const frame = setup.captureCharFrame()
		// One group line plus three item lines, each carrying bars.
		expect(frame.split("\n").filter((line) => line.includes("█")).length).toBe(4)
		expect(frame).toContain("◆")
		setup.renderer.destroy()
	})
})
