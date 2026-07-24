import { homedir } from "node:os"
import { describe, expect, test } from "bun:test"
import type { EditorCommandFields } from "../src/editorCommand.js"
import { defaultWorktreePathTemplate, isInsidePhux, phuxSessionName, renderWorktreePath, worktreeBranchName, worktreeExcludeEntry } from "../src/worktreeCommand.js"

const fields: EditorCommandFields = {
	repository: "dlvhdr/gh-dash",
	number: 42,
	headRef: "feature/x",
	baseRef: "main",
	author: "octocat",
	url: "https://github.com/dlvhdr/gh-dash/pull/42",
}

describe("renderWorktreePath", () => {
	test("default template nests under the repo's .ghui directory", () => {
		expect(renderWorktreePath(defaultWorktreePathTemplate, fields, "/code/gh-dash")).toBe("/code/gh-dash/.ghui/worktrees/pr-42")
	})

	test("substitutes owner, name, and headRef tokens", () => {
		expect(renderWorktreePath("/wt/{{owner}}/{{name}}/{{headRef}}", fields, "/code/gh-dash")).toBe("/wt/dlvhdr/gh-dash/feature/x")
	})

	test("expands a leading ~", () => {
		expect(renderWorktreePath("~/worktrees/pr-{{number}}", fields, "/code/gh-dash")).toBe(`${homedir()}/worktrees/pr-42`)
	})
})

describe("worktreeBranchName", () => {
	test("namespaces the PR number", () => {
		expect(worktreeBranchName(42)).toBe("pr/42")
	})
})

describe("phuxSessionName", () => {
	test("uses repo name and PR number", () => {
		expect(phuxSessionName(fields)).toBe("gh-dash-pr-42")
	})

	test("collapses characters phux selectors reserve", () => {
		expect(phuxSessionName({ ...fields, repository: "acme/my.web:app" })).toBe("my-web-app-pr-42")
	})
})

describe("isInsidePhux", () => {
	test("detects PHUX_TERMINAL_ID", () => {
		expect(isInsidePhux({ PHUX_TERMINAL_ID: "30" })).toBe(true)
		expect(isInsidePhux({ PHUX_TERMINAL_ID: "" })).toBe(false)
		expect(isInsidePhux({})).toBe(false)
	})
})

describe("worktreeExcludeEntry", () => {
	test("returns the top-level segment for an in-repo worktree", () => {
		expect(worktreeExcludeEntry("/code/gh-dash", "/code/gh-dash/.ghui/worktrees/pr-42")).toBe(".ghui/")
	})

	test("returns null when the worktree is outside the repo", () => {
		expect(worktreeExcludeEntry("/code/gh-dash", "/worktrees/gh-dash/pr-42")).toBeNull()
		expect(worktreeExcludeEntry("/code/gh-dash", "/code/gh-dash-worktrees/pr-42")).toBeNull()
	})
})
