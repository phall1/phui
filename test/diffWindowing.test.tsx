import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { PullRequestItem } from "../src/domain.js"
import { RegistryProvider } from "@effect/atom-solid"
import { diffScrollTopAtom } from "../src/ui/diff/atoms.js"
import { buildStackedDiffFiles, PullRequestDiffState, splitPatchFiles, stackedFileBlockHeight } from "../src/ui/diff.js"
import { PullRequestDiffPane } from "../src/ui/PullRequestDiffPane.js"

const FILE_COUNT = 30
const LINES_PER_FILE = 10
const PANE_HEIGHT = 20

const makePatch = () =>
	Array.from({ length: FILE_COUNT }, (_, index) => {
		const body = Array.from({ length: LINES_PER_FILE }, (_, line) => ` const f${index}l${line} = ${line}`).join("\n")
		return `diff --git a/f${index}.ts b/f${index}.ts\n--- a/f${index}.ts\n+++ b/f${index}.ts\n@@ -1,${LINES_PER_FILE} +1,${LINES_PER_FILE} @@\n${body}`
	}).join("\n")

const files = splitPatchFiles(makePatch())
const stackedFiles = buildStackedDiffFiles(files, "unified", "none", 100)
const totalHeight = stackedFiles.reduce((sum, file) => sum + stackedFileBlockHeight(file), 0)

const pullRequest = {
	repository: "owner/repo",
	author: "author",
	headRefOid: "abc123",
	headRefName: "branch",
	baseRefName: "main",
	defaultBranchName: "main",
	number: 1,
	title: "Windowing",
	body: "",
	labels: [],
	additions: 10,
	deletions: 10,
	changedFiles: FILE_COUNT,
	state: "open",
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	closedAt: null,
	url: "https://github.com/owner/repo/pull/1",
} as unknown as PullRequestItem

const renderPane = async (scrollTop: number) => {
	const mounted = new Set<number>()
	let scroll: ScrollBoxRenderable | null = null
	const setup = await testRender(
		() => (
			<RegistryProvider initialValues={[[diffScrollTopAtom, scrollTop]] as never}>
				<PullRequestDiffPane
					pullRequest={pullRequest}
					diffState={PullRequestDiffState.Ready({ patch: makePatch(), files })}
					stackedFiles={stackedFiles}
					view="unified"
					whitespaceMode="show"
					wrapMode="none"
					paneWidth={100}
					height={PANE_HEIGHT}
					loadingIndicator="⠋"
					scrollRef={(element) => {
						scroll = element
					}}
					setDiffRef={(index, diff) => {
						if (diff) mounted.add(index)
						else mounted.delete(index)
					}}
					selectedCommentAnchor={null}
					selectedCommentLabel={null}
					selectedCommentThread={[]}
					onSelectCommentLine={() => {}}
					themeId="phui"
					themeGeneration={0}
					showScrollbar={false}
				/>
			</RegistryProvider>
		),
		{ width: 102, height: PANE_HEIGHT },
	)
	// Drive the real scrollbox and let the pane's scroll interval publish it, so
	// the atom and the scrollbox agree (the pane is the source of truth).
	scroll?.scrollTo({ x: 0, y: scrollTop })
	await Bun.sleep(80)
	for (let i = 0; i < 3; i++) await setup.renderOnce()
	return { setup, mounted, scrollHeight: () => (scroll as ScrollBoxRenderable | null)?.scrollHeight ?? -1 }
}

describe("diff pane windowing (render)", () => {
	test("mounts only a handful of files, not the whole patch", async () => {
		const { setup, mounted } = await renderPane(0)
		expect(mounted.size).toBeGreaterThan(0)
		expect(mounted.size).toBeLessThan(8)
		expect(mounted.has(0)).toBe(true)
		expect(mounted.has(FILE_COUNT - 1)).toBe(false)
		setup.renderer.destroy()
	})

	test("preserves total scroll height with spacer rows", async () => {
		const { setup, scrollHeight } = await renderPane(0)
		expect(scrollHeight()).toBe(totalHeight)
		setup.renderer.destroy()
	})

	test("mounts the files around the scrolled position", async () => {
		const target = stackedFiles[20]!
		const { setup, mounted } = await renderPane(target.headerLine)
		expect(mounted.has(20)).toBe(true)
		expect(mounted.has(0)).toBe(false)
		setup.renderer.destroy()
	})
})
