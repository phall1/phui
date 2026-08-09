// === Stars: the GitHub seam ===
//
// `/user/starred` is REST-only, so like the Inbox this goes through `gh` via
// `CommandRunner`. Listing never fails (warnings channel); the star/unstar
// mutation does, because it changes state on github.com.
//
// Paging is explicit rather than `gh api --paginate`: `--paginate` has no page
// cap, so a 3,000-star account would fire thirty requests before the surface
// drew anything. Five pages of 100 covers essentially everyone, and the report
// says so when it stops early instead of quietly showing a partial list.

import { Cause, Effect, Schema } from "effect"
import { errorMessage } from "../errors.js"
import { CommandRunner, type CommandError } from "../services/CommandRunner.js"
import { emptyStarsReport, type StarredRepository, type StarsReport } from "./types.js"

const PAGE_SIZE = 100
const MAX_PAGES = 5

/** `star+json` wraps each repo in `{starred_at, repo}`; without it there is no star date. */
const STAR_ACCEPT = "Accept: application/vnd.github.star+json"

const RawRepoSchema = Schema.Struct({
	full_name: Schema.String,
	description: Schema.optionalKey(Schema.NullOr(Schema.String)),
	language: Schema.optionalKey(Schema.NullOr(Schema.String)),
	stargazers_count: Schema.optionalKey(Schema.NullOr(Schema.Number)),
	forks_count: Schema.optionalKey(Schema.NullOr(Schema.Number)),
	topics: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
	archived: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
	fork: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
	pushed_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
	html_url: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

const RawStarSchema = Schema.Struct({
	starred_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
	repo: RawRepoSchema,
})

const RawStarListSchema = Schema.Array(RawStarSchema)

const optionalDate = (value: string | null | undefined): Date | null => {
	if (value === undefined || value === null) return null
	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const parseStar = (raw: typeof RawStarSchema.Type): StarredRepository => {
	const repo = raw.repo
	const [owner = "", name = ""] = repo.full_name.split("/")
	return {
		repository: repo.full_name,
		owner,
		name,
		description: repo.description ?? null,
		language: repo.language ?? null,
		stars: repo.stargazers_count ?? 0,
		forks: repo.forks_count ?? 0,
		topics: repo.topics ?? [],
		archived: repo.archived === true,
		fork: repo.fork === true,
		pushedAt: optionalDate(repo.pushed_at),
		starredAt: optionalDate(raw.starred_at),
		url: repo.html_url ?? `https://github.com/${repo.full_name}`,
	}
}

const pageArgs = (page: number): readonly string[] => ["api", "-H", STAR_ACCEPT, `user/starred?per_page=${PAGE_SIZE}&page=${page}`]

export const starsWarning = (cause: unknown): string => {
	const message = errorMessage(cause)
	if (/401|bad credentials|requires authentication/i.test(message)) return "GitHub rejected the request — run `gh auth login`."
	if (/rate limit/i.test(message)) return "GitHub rate limit reached; press r once it resets."
	if (/enoent|not found: gh|command not found/i.test(message)) return "The `gh` CLI is not on PATH; phui reads your stars through it."
	return `Could not load starred repositories: ${message}`
}

export const listStarredRepositories = (now: Date): Effect.Effect<StarsReport, never, CommandRunner> =>
	Effect.gen(function* () {
		const command = yield* CommandRunner
		const items: StarredRepository[] = []
		let truncated = false

		for (let page = 1; page <= MAX_PAGES; page++) {
			const outcome = yield* command.runSchema(RawStarListSchema, "gh", pageArgs(page)).pipe(
				Effect.map((rows) => ({ _tag: "ok" as const, rows })),
				Effect.catchCause((cause) => Effect.succeed({ _tag: "failed" as const, message: starsWarning(Cause.squash(cause)) })),
			)
			// A failure on page 1 is a failure; a failure on a later page still has
			// rows worth showing, so it degrades to a warning on a partial list.
			if (outcome._tag === "failed") {
				if (page === 1) return emptyStarsReport(now, [outcome.message])
				return { items, fetchedAt: now, truncated: true, warnings: [outcome.message] }
			}
			items.push(...outcome.rows.map(parseStar))
			if (outcome.rows.length < PAGE_SIZE) break
			if (page === MAX_PAGES) truncated = true
		}

		return {
			items,
			fetchedAt: now,
			truncated,
			warnings: truncated ? [`Showing the first ${items.length} stars; phui stops at ${MAX_PAGES} pages.`] : [],
		}
	}).pipe(Effect.withSpan("Stars.list"))

export const unstarRepository = (repository: string): Effect.Effect<void, CommandError, CommandRunner> =>
	Effect.gen(function* () {
		const command = yield* CommandRunner
		yield* command.run("gh", ["api", "-X", "DELETE", `user/starred/${repository}`])
	}).pipe(Effect.asVoid, Effect.withSpan("Stars.unstar"))

export const starRepository = (repository: string): Effect.Effect<void, CommandError, CommandRunner> =>
	Effect.gen(function* () {
		const command = yield* CommandRunner
		yield* command.run("gh", ["api", "-X", "PUT", `user/starred/${repository}`])
	}).pipe(Effect.asVoid, Effect.withSpan("Stars.star"))
