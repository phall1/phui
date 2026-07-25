import { describe, expect, test } from "bun:test"
import { createTerminalTitleWriter, createTerminalTitleWriterForOutput, deriveTerminalTitle, encodeTerminalTitle, type TerminalTitleState } from "../src/terminalTitle.ts"

const state = (overrides: Partial<TerminalTitleState> = {}): TerminalTitleState => ({
	activeWorkspaceSurface: "repos",
	selectedRepository: null,
	selectedPullRequest: null,
	detailFullView: false,
	diffFullView: false,
	commentsViewActive: false,
	runsFullView: false,
	...overrides,
})

describe("terminal title derivation", () => {
	test("uses the application title at home and whenever no scope is selected", () => {
		expect(deriveTerminalTitle(state())).toBe("phui")
		expect(deriveTerminalTitle(state({ activeWorkspaceSurface: "pullRequests" }))).toBe("phui")
		expect(deriveTerminalTitle(state({ activeWorkspaceSurface: "issues" }))).toBe("phui")
	})

	test("identifies a selected repository", () => {
		expect(
			deriveTerminalTitle(
				state({
					activeWorkspaceSurface: "pullRequests",
					selectedRepository: "kitlangton/ghui",
				}),
			),
		).toBe("phui · kitlangton/ghui")
	})

	test.each([
		["details", { detailFullView: true }],
		["diff", { diffFullView: true }],
		["comments", { commentsViewActive: true }],
		["runs", { runsFullView: true }],
	] as const)("identifies a pull request in its %s view", (view, viewState) => {
		expect(
			deriveTerminalTitle(
				state({
					activeWorkspaceSurface: "pullRequests",
					selectedPullRequest: { repository: "kitlangton/ghui", number: 123 },
					...viewState,
				}),
			),
		).toBe(`phui · kitlangton/ghui#123 · ${view}`)
	})

	test.each(["issues", "actions"] as const)("identifies the repository %s surface", (surface) => {
		expect(
			deriveTerminalTitle(
				state({
					activeWorkspaceSurface: surface,
					selectedRepository: "kitlangton/ghui",
					selectedPullRequest: { repository: "stale/selection", number: 99 },
					detailFullView: true,
					diffFullView: true,
					commentsViewActive: true,
					runsFullView: true,
				}),
			),
		).toBe(`phui · kitlangton/ghui · ${surface}`)
	})

	test("matches the rendered view precedence while flags transition", () => {
		const pullRequest = { repository: "kitlangton/ghui", number: 123 }
		expect(
			deriveTerminalTitle(
				state({
					activeWorkspaceSurface: "pullRequests",
					selectedPullRequest: pullRequest,
					detailFullView: true,
					diffFullView: true,
					commentsViewActive: true,
					runsFullView: true,
				}),
			),
		).toBe("phui · kitlangton/ghui#123 · comments")
		expect(
			deriveTerminalTitle(state({ activeWorkspaceSurface: "pullRequests", selectedPullRequest: pullRequest, detailFullView: true, diffFullView: true, runsFullView: true })),
		).toBe("phui · kitlangton/ghui#123 · runs")
		expect(deriveTerminalTitle(state({ activeWorkspaceSurface: "pullRequests", selectedPullRequest: pullRequest, detailFullView: true, diffFullView: true }))).toBe(
			"phui · kitlangton/ghui#123 · diff",
		)
	})

	test("removes terminal control characters from live identity", () => {
		const title = deriveTerminalTitle(
			state({
				activeWorkspaceSurface: "pullRequests",
				selectedPullRequest: { repository: "ow\u001bner/re\u0007po\n", number: 12 },
				diffFullView: true,
			}),
		)
		expect(title).toBe("phui · ow ner/re po#12 · diff")
		expect(title).not.toMatch(/\p{Cc}/u)
	})
})

describe("terminal title output", () => {
	test("encodes a sanitized title with standard OSC 0", () => {
		expect(encodeTerminalTitle("phui\u001b]2;hijack\u0007")).toBe("\u001b]0;phui ]2;hijack\u0007")
	})

	test("writes only when the sanitized title changes", () => {
		const sequences: string[] = []
		const writeTitle = createTerminalTitleWriter((sequence) => sequences.push(sequence))

		expect(writeTitle("phui")).toBe(true)
		expect(writeTitle("phui")).toBe(false)
		expect(writeTitle("phui\u0000")).toBe(false)
		expect(writeTitle("phui · kitlangton/ghui")).toBe(true)
		expect(sequences).toEqual(["\u001b]0;phui\u0007", "\u001b]0;phui · kitlangton/ghui\u0007"])
	})

	test("does not attach output in non-terminal environments", () => {
		let writes = 0
		expect(
			createTerminalTitleWriterForOutput({
				isTTY: false,
				write: () => {
					writes += 1
				},
			}),
		).toBeNull()
		expect(createTerminalTitleWriterForOutput(undefined)).toBeNull()
		expect(writes).toBe(0)
	})
})
