import { describe, expect, test } from "bun:test"
import { parseStar } from "../src/stars/github.ts"
import { formatStarCount, matchesStarQuery, nextStarsSortMode, sortStarredRepositories, type StarredRepository } from "../src/stars/types.ts"

const star = (overrides: Partial<StarredRepository> = {}): StarredRepository => ({
	repository: "owner/repo",
	owner: "owner",
	name: "repo",
	description: "A repository",
	language: "TypeScript",
	stars: 10,
	forks: 1,
	topics: [],
	archived: false,
	fork: false,
	pushedAt: new Date("2026-01-01T00:00:00Z"),
	starredAt: new Date("2026-01-01T00:00:00Z"),
	url: "https://github.com/owner/repo",
	...overrides,
})

describe("parseStar", () => {
	test("reads the star envelope and fills in every optional field", () => {
		const parsed = parseStar({
			starred_at: "2026-02-01T00:00:00Z",
			repo: { full_name: "sst/opentui", description: "TUI toolkit", language: "TypeScript", stargazers_count: 6400, topics: ["tui"], html_url: "https://github.com/sst/opentui" },
		})

		expect(parsed).toMatchObject({ repository: "sst/opentui", owner: "sst", name: "opentui", stars: 6400, forks: 0, archived: false })
		expect(parsed.starredAt?.toISOString()).toBe("2026-02-01T00:00:00.000Z")
		expect(parsed.pushedAt).toBeNull()
	})

	test("synthesises a URL when GitHub omits html_url", () => {
		expect(parseStar({ repo: { full_name: "owner/repo" } }).url).toBe("https://github.com/owner/repo")
	})

	test("treats an unparseable date as absent rather than Invalid Date", () => {
		expect(parseStar({ starred_at: "not a date", repo: { full_name: "owner/repo" } }).starredAt).toBeNull()
	})
})

describe("sortStarredRepositories", () => {
	const older = star({ repository: "a/older", starredAt: new Date("2025-01-01"), pushedAt: new Date("2025-06-01"), stars: 500 })
	const newer = star({ repository: "z/newer", starredAt: new Date("2026-01-01"), pushedAt: new Date("2024-01-01"), stars: 10 })

	test("orders by each mode independently", () => {
		expect(sortStarredRepositories([older, newer], "starred").map((entry) => entry.repository)).toEqual(["z/newer", "a/older"])
		expect(sortStarredRepositories([newer, older], "pushed").map((entry) => entry.repository)).toEqual(["a/older", "z/newer"])
		expect(sortStarredRepositories([newer, older], "stars").map((entry) => entry.repository)).toEqual(["a/older", "z/newer"])
		expect(sortStarredRepositories([newer, older], "name").map((entry) => entry.repository)).toEqual(["a/older", "z/newer"])
	})

	test("does not mutate its input", () => {
		const input = [newer, older]
		sortStarredRepositories(input, "name")
		expect(input.map((entry) => entry.repository)).toEqual(["z/newer", "a/older"])
	})

	test("sorts a missing date last rather than first", () => {
		const undated = star({ repository: "x/undated", starredAt: null })
		expect(sortStarredRepositories([undated, newer], "starred").map((entry) => entry.repository)).toEqual(["z/newer", "x/undated"])
	})

	test("cycles through every sort mode and back", () => {
		expect(nextStarsSortMode(nextStarsSortMode(nextStarsSortMode(nextStarsSortMode("starred"))))).toBe("starred")
	})
})

describe("matchesStarQuery", () => {
	const item = star({ repository: "charmbracelet/bubbletea", description: "A powerful little TUI framework", language: "Go", topics: ["tui", "cli"] })

	test("matches across name, description, language, and topics", () => {
		expect(matchesStarQuery(item, "bubble")).toBe(true)
		expect(matchesStarQuery(item, "powerful")).toBe(true)
		expect(matchesStarQuery(item, "go")).toBe(true)
		expect(matchesStarQuery(item, "cli")).toBe(true)
	})

	test("is case-insensitive and treats an empty query as match-all", () => {
		expect(matchesStarQuery(item, "  TUI  ")).toBe(true)
		expect(matchesStarQuery(item, "")).toBe(true)
	})

	test("rejects a genuine miss", () => {
		expect(matchesStarQuery(item, "kubernetes")).toBe(false)
	})

	test("survives a null description and language", () => {
		expect(matchesStarQuery(star({ description: null, language: null }), "typescript")).toBe(false)
	})
})

describe("formatStarCount", () => {
	test("keeps small counts exact and abbreviates the rest", () => {
		expect(formatStarCount(0)).toBe("0")
		expect(formatStarCount(999)).toBe("999")
		expect(formatStarCount(1200)).toBe("1.2k")
		expect(formatStarCount(78000)).toBe("78k")
	})
})
