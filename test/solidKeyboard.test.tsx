import { describe, expect, test } from "bun:test"
import { createComputed } from "solid-js"
import { testRender, useKeyboard } from "@opentui/solid"

process.env.PHUI_MOCK_PR_COUNT = "80"
process.env.PHUI_MOCK_REPO_COUNT = "4"
process.env.PHUI_MOCK_WORKSPACE_PREFERENCES_PATH = "off"
process.env.PHUI_PR_PAGE_SIZE = "100"

describe("solid keyboard", () => {
	test("useKeyboard receives mock keypresses", async () => {
		const hits: string[] = []
		const Probe = () => {
			useKeyboard((event) => {
				hits.push(event.name)
			})
			return <text>probe</text>
		}
		const setup = await testRender(() => <Probe />, { width: 20, height: 3 })
		setup.mockInput.pressKey("j")
		await setup.renderOnce()
		expect(hits).toContain("j")
		setup.renderer.destroy()
	})

	test("j advances selectedIndexAtom in App", async () => {
		const { RegistryProvider } = await import("../src/atom-solid.js")
		const { useAtomValue: useAtomValueSolid } = await import("@effect/atom-solid")
		const { selectedIndexAtom } = await import("../src/ui/listSelection/atoms.js")
		const { selectedPullRequestAtom } = await import("../src/ui/pullRequests/atoms.js")
		const { App } = await import("../src/App.tsx")
		let index = -1
		let prNumber = -1
		const Reader = () => {
			const liveIndex = useAtomValueSolid(() => selectedIndexAtom)
			const livePr = useAtomValueSolid(() => selectedPullRequestAtom)
			createComputed(() => {
				index = liveIndex() ?? -1
				prNumber = livePr()?.number ?? -1
			})
			return <text>{`${liveIndex()}:${livePr()?.number ?? "-"}`}</text>
		}
		const setup = await testRender(
			() => (
				<RegistryProvider>
					<Reader />
					<App />
				</RegistryProvider>
			),
			{ width: 100, height: 20 },
		)
		for (let i = 0; i < 40; i++) {
			await setup.renderOnce()
			if (setup.captureCharFrame().includes("#1000")) break
		}
		const before = { index, prNumber }
		setup.mockInput.pressKey("j")
		for (let i = 0; i < 6; i++) await setup.renderOnce()
		expect({ before, after: { index, prNumber }, frameHas1004: setup.captureCharFrame().includes("#1004") }).toEqual({
			before: { index: 0, prNumber: 1000 },
			after: { index: 1, prNumber: 1004 },
			frameHas1004: true,
		})
		setup.renderer.destroy()
	})
})
