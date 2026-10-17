import { describe, expect, test } from "bun:test"
import { formatLaunchIntentError, LaunchIntentError, parseLaunchIntent, type PhuiLaunchView } from "../src/launchIntent.js"

const captureLaunchError = (args: readonly string[]): LaunchIntentError => {
	try {
		parseLaunchIntent(args)
	} catch (error) {
		if (error instanceof LaunchIntentError) return error
		throw error
	}
	throw new Error(`Expected launch arguments to fail: ${args.join(" ")}`)
}

describe("parseLaunchIntent", () => {
	test("uses the ordinary startup intent when no arguments are supplied", () => {
		expect(parseLaunchIntent([])).toEqual({ _tag: "Default" })
	})

	test.each([
		["owner/repo", "owner/repo"],
		["https://github.com/owner/repo", "owner/repo"],
		["https://github.com/owner/repo/", "owner/repo"],
		["https://github.com/owner/repo.git", "owner/repo"],
		["http://github.com/owner/repo", "owner/repo"],
	] as const)("parses repository target %s", (target, repository) => {
		expect(parseLaunchIntent([target])).toEqual({ _tag: "Repository", repository })
	})

	test.each([
		["owner/repo#123", "owner/repo", 123],
		["https://github.com/owner/repo/pull/123", "owner/repo", 123],
		["https://github.com/owner/repo/pull/123/", "owner/repo", 123],
		["http://github.com/owner/repo/pull/123", "owner/repo", 123],
	] as const)("parses pull request target %s", (target, repository, number) => {
		expect(parseLaunchIntent([target])).toEqual({ _tag: "PullRequest", repository, number, view: "details" })
	})

	test("defaults a pull request to the details view", () => {
		expect(parseLaunchIntent(["owner/repo#7"])).toEqual({ _tag: "PullRequest", repository: "owner/repo", number: 7, view: "details" })
	})

	test.each<PhuiLaunchView>(["details", "diff", "comments", "runs"])("accepts the explicit %s view", (view) => {
		expect(parseLaunchIntent(["owner/repo#7", "--view", view])).toEqual({ _tag: "PullRequest", repository: "owner/repo", number: 7, view })
	})

	test("allows --view before the target", () => {
		expect(parseLaunchIntent(["--view", "diff", "owner/repo#7"])).toEqual({ _tag: "PullRequest", repository: "owner/repo", number: 7, view: "diff" })
	})

	test("accepts the --view=value spelling", () => {
		expect(parseLaunchIntent(["--view=comments", "owner/repo#7"])).toEqual({ _tag: "PullRequest", repository: "owner/repo", number: 7, view: "comments" })
	})

	test.each([
		"owner",
		"/repo",
		"owner/",
		"owner/repo/extra",
		"owner/repo#",
		"owner/repo#abc",
		"owner/repo#1#2",
		"https://example.com/owner/repo",
		"https://github.com/owner/repo/issues/1",
		"https://github.com/owner/repo/pull/1/files",
	] as const)("rejects malformed target %s", (target) => {
		expect(captureLaunchError([target]).message).toMatch(/^Invalid target:/)
	})

	test.each(["owner/repo#0", "owner/repo#-1", "https://github.com/owner/repo/pull/0", "https://github.com/owner/repo/pull/-1"] as const)(
		"rejects non-positive pull request target %s",
		(target) => {
			expect(captureLaunchError([target]).message).toBe("Pull request number must be a positive integer.")
		},
	)

	test("rejects a repository target combined with --view", () => {
		expect(captureLaunchError(["owner/repo", "--view", "diff"]).message).toBe("Option --view requires a pull request target.")
	})

	test("rejects --view without a target", () => {
		expect(captureLaunchError(["--view", "diff"]).message).toBe("Option --view requires a pull request target.")
	})

	test.each(["--repo", "-x", "--diff"] as const)("rejects unknown option %s", (option) => {
		expect(captureLaunchError([option]).message).toBe(`Unknown option: ${option}.`)
	})

	test("rejects an omitted --view value", () => {
		expect(captureLaunchError(["owner/repo#7", "--view"]).message).toBe("Option --view requires a value.")
	})

	test.each(["", "overview", "DIFF"] as const)("rejects invalid --view value %s", (view) => {
		expect(captureLaunchError(["owner/repo#7", `--view=${view}`]).message).toContain("Invalid --view value:")
	})

	test("rejects a duplicated option even when its values agree", () => {
		expect(captureLaunchError(["owner/repo#7", "--view", "diff", "--view=diff"]).message).toBe("Option --view may only be specified once.")
	})

	test("rejects conflicting option values", () => {
		expect(captureLaunchError(["--view", "diff", "owner/repo#7", "--view", "runs"]).message).toBe("Conflicting --view values: diff and runs.")
	})

	test.each([
		["owner/repo", "other/repo"],
		["owner/repo#1", "extra"],
	] as const)("rejects extra positional arguments", (first, second) => {
		expect(captureLaunchError([first, second]).message).toContain("Only one launch target is allowed.")
	})

	test("does not mutate its argument array", () => {
		const args = ["--view", "runs", "owner/repo#9"]
		parseLaunchIntent(args)
		expect(args).toEqual(["--view", "runs", "owner/repo#9"])
	})
})

describe("parseLaunchIntent inside a clone", () => {
	const inClone = () => "owner/here"

	test("opens the current repository when no target is supplied", () => {
		expect(parseLaunchIntent([], inClone)).toEqual({ _tag: "Repository", repository: "owner/here" })
	})

	test("--home opens the user-wide workspace even inside a clone", () => {
		expect(parseLaunchIntent(["--home"], inClone)).toEqual({ _tag: "Default" })
	})

	test("falls back to the user-wide workspace outside a clone", () => {
		expect(parseLaunchIntent([], () => null)).toEqual({ _tag: "Default" })
	})

	test.each(["42", "#42"])("resolves %s against the current repository", (target) => {
		expect(parseLaunchIntent([target, "--view", "diff"], inClone)).toEqual({ _tag: "PullRequest", repository: "owner/here", number: 42, view: "diff" })
	})

	test("an explicit target never consults the working directory", () => {
		let consulted = false
		expect(
			parseLaunchIntent(["other/repo#3"], () => {
				consulted = true
				return "owner/here"
			}),
		).toEqual({ _tag: "PullRequest", repository: "other/repo", number: 3, view: "details" })
		expect(consulted).toBe(false)
	})

	test("rejects a bare number outside a clone", () => {
		expect(captureLaunchError(["42"]).message).toContain("needs a GitHub repository")
	})

	test("rejects a non-positive bare number", () => {
		expect(captureLaunchError(["#0"]).message).toBe("Pull request number must be a positive integer.")
	})

	test("rejects --home combined with a target", () => {
		expect(captureLaunchError(["--home", "owner/repo"]).message).toBe("Option --home cannot be combined with a launch target.")
	})
})

describe("formatLaunchIntentError", () => {
	test("formats a concise pre-TUI error with a help hint", () => {
		expect(formatLaunchIntentError(new LaunchIntentError("Invalid target: nope."))).toBe("phui: Invalid target: nope.\nRun `phui --help` for usage.")
	})
})
