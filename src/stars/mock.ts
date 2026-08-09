// Fixture stars for `bun run dev:mock`, which runs with no `gh` at all.

import type { StarredRepository, StarsReport } from "./types.js"

const SPECS: readonly (Pick<StarredRepository, "repository" | "description" | "language" | "stars" | "forks" | "topics"> & {
	readonly pushedDaysAgo: number
	readonly starredDaysAgo: number
	readonly archived?: boolean
})[] = [
	{
		repository: "sst/opentui",
		description: "Build terminal user interfaces with familiar component models",
		language: "TypeScript",
		stars: 6400,
		forks: 180,
		topics: ["tui", "terminal"],
		pushedDaysAgo: 1,
		starredDaysAgo: 3,
	},
	{
		repository: "Effect-TS/effect",
		description: "A fully-fledged functional effect system for TypeScript",
		language: "TypeScript",
		stars: 9100,
		forks: 420,
		topics: ["effect", "typescript"],
		pushedDaysAgo: 0,
		starredDaysAgo: 12,
	},
	{
		repository: "oven-sh/bun",
		description: "Incredibly fast JavaScript runtime, bundler, test runner, and package manager",
		language: "Zig",
		stars: 78000,
		forks: 2900,
		topics: ["javascript", "runtime"],
		pushedDaysAgo: 0,
		starredDaysAgo: 40,
	},
	{
		repository: "kitlangton/ghui",
		description: "Terminal UI for GitHub pull requests",
		language: "TypeScript",
		stars: 1200,
		forks: 38,
		topics: ["github", "tui"],
		pushedDaysAgo: 41,
		starredDaysAgo: 60,
	},
	{
		repository: "charmbracelet/bubbletea",
		description: "A powerful little TUI framework",
		language: "Go",
		stars: 30500,
		forks: 1100,
		topics: ["tui", "go"],
		pushedDaysAgo: 4,
		starredDaysAgo: 190,
	},
	{
		repository: "tree-sitter/tree-sitter",
		description: "An incremental parsing system for programming tools",
		language: "Rust",
		stars: 20100,
		forks: 1500,
		topics: ["parser"],
		pushedDaysAgo: 6,
		starredDaysAgo: 300,
	},
	{
		repository: "phall1/phux",
		description: "Terminal multiplexer with an agent-facing control plane",
		language: "Rust",
		stars: 240,
		forks: 6,
		topics: ["terminal"],
		pushedDaysAgo: 2,
		starredDaysAgo: 8,
	},
	{
		repository: "jqlang/jq",
		description: "Command-line JSON processor",
		language: "C",
		stars: 31800,
		forks: 1600,
		topics: ["json", "cli"],
		pushedDaysAgo: 22,
		starredDaysAgo: 700,
	},
	{
		repository: "some-org/abandoned-thing",
		description: "No longer maintained",
		language: "Ruby",
		stars: 90,
		forks: 3,
		topics: [],
		pushedDaysAgo: 1400,
		starredDaysAgo: 1500,
		archived: true,
	},
]

const DAY_MS = 24 * 60 * 60 * 1000

export const mockStarsReport = (now: Date): StarsReport => ({
	items: SPECS.map((spec) => ({
		repository: spec.repository,
		owner: spec.repository.split("/")[0] ?? "",
		name: spec.repository.split("/")[1] ?? "",
		description: spec.description,
		language: spec.language,
		stars: spec.stars,
		forks: spec.forks,
		topics: spec.topics,
		archived: spec.archived === true,
		fork: false,
		pushedAt: new Date(now.getTime() - spec.pushedDaysAgo * DAY_MS),
		starredAt: new Date(now.getTime() - spec.starredDaysAgo * DAY_MS),
		url: `https://github.com/${spec.repository}`,
	})),
	fetchedAt: now,
	truncated: false,
	warnings: [],
})
