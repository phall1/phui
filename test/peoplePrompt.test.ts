import { describe, expect, test } from "bun:test"
import { parsePeoplePrompt } from "../src/ui/modals/peoplePrompt.ts"
import { updateBranchConflictNotice, wrapRunLogText } from "../src/ui/runs/runLogs.ts"

describe("parsePeoplePrompt", () => {
	test("adds a login", () => {
		expect(parsePeoplePrompt(" kit ")).toEqual({ action: "add", login: "kit" })
		expect(parsePeoplePrompt("@alice")).toEqual({ action: "add", login: "alice" })
	})

	test("removes a login with - or !", () => {
		expect(parsePeoplePrompt("-kit")).toEqual({ action: "remove", login: "kit" })
		expect(parsePeoplePrompt("!org/core")).toEqual({ action: "remove", login: "org/core" })
		expect(parsePeoplePrompt("- @bob")).toEqual({ action: "remove", login: "bob" })
	})

	test("rejects empty input", () => {
		expect(parsePeoplePrompt("")).toBeNull()
		expect(parsePeoplePrompt("   ")).toBeNull()
		expect(parsePeoplePrompt("-")).toBeNull()
	})
})

describe("wrapRunLogText", () => {
	test("wraps failed-job log text to the pane width", () => {
		expect(wrapRunLogText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"])
		expect(wrapRunLogText("one\n\ntwo", 8)).toEqual(["one", "", "two"])
	})

	test("empty logs get a placeholder", () => {
		expect(wrapRunLogText("  \n", 20)).toEqual(["No failed-job logs."])
	})
})

describe("updateBranchConflictNotice", () => {
	test("sends conflicts to the editor/worktree escape hatches", () => {
		expect(updateBranchConflictNotice("Merge conflict in src/a.ts")).toContain("editor (e)")
		expect(updateBranchConflictNotice("not mergeable")).toContain("worktree (w)")
		expect(updateBranchConflictNotice("API rate limit")).toBeNull()
	})
})
