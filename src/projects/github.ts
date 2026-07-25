// === Projects: remote (GitHub) facts ===
//
// Given the local RepoSnapshots the scanner produced, fetch the handful of
// remote facts the checks need — open PRs, the default branch, the latest CI
// conclusion on that branch, and the latest release — and return them keyed by
// "owner/repo".
//
// THREE RULES SHAPE THIS FILE:
//
//  1. NEVER FAIL. `fetchProjectGitHubSnapshots` has `E = never`. No auth, no
//     network, a rate limit, a deleted remote — every one of those yields
//     absent data for the affected repositories plus a warning string. The
//     Projects surface must still render local findings when GitHub is dark;
//     `ProjectSnapshot.github` is optional precisely for this.
//
//  2. BE CHEAP. This fans out over every project with a GitHub remote (~20 for
//     a normal portfolio) and re-runs on every rescan. Every request is a
//     `Bun.spawn` of `gh` (~100ms), and secondary rate limits punish fanout
//     harder than the hourly quota does. So: an in-process TTL memo short-
//     circuits rescans entirely, the default branch is read from the shared
//     `repository_details` cache (or deduced for free from a PR) before anyone
//     calls the API, and — when a CommandRunner is available — one aliased
//     GraphQL document covers a whole batch of repositories at once.
//
//  3. REUSE THE EXISTING SEAMS. Everything here goes through the upstream
//     `GitHubService` / `CacheService` / `CommandRunner` shapes. The
//     dependencies are declared as narrow structural ports, so the real
//     services (and `MockGitHubService`) satisfy them without this module
//     importing the runtime — which is what makes the entry point testable.
//
// REQUEST BUDGET for N repositories with M of them stale (memo cold):
//   • memo hit                      0 requests
//   • batch path (CommandRunner)    ceil(M / batchSize) ≈ 2 for M=20
//   • service path (fallback)       1 per repo (open PRs)
//                                 + 1 per repo with a known default branch (runs)
//                                 + 1 per repo whose default branch is unknown
//                                   and uncached (repository details)
//                                 ⇒ 2M typical, 3M worst case
// The batch path is therefore ~20x cheaper and is the only source of release
// data; see `ProjectGitHubDeps.command` for how to enable it.

import { Cause, Config, Effect, Schema } from "effect"
import type { PullRequestItem, RepositoryDetails, RunConclusion, WorkflowRun } from "../domain.js"
import { errorMessage } from "../errors.js"
import type { ItemListInput, ItemPage } from "../item.js"
import type { CacheError } from "../services/CacheService.js"
import { isCommandTimeoutError, type CommandError, type JsonParseError } from "../services/CommandRunner.js"
import { isGitHubRateLimitError } from "../services/githubRateLimit.js"
import type { GitHubError } from "../services/GitHubService.js"
import type { GitHubSnapshot, ProjectPullRequest, ProjectRelease, RepoSnapshot } from "./types.js"

// === Tunables ===

const DEFAULT_TTL_MS = 10 * 60_000
const DEFAULT_CONCURRENCY = 4
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_PULL_REQUEST_LIMIT = 20

/** Default branches change about once a decade; the shared cache row is good for a long time. */
const REPOSITORY_DETAILS_TTL_MS = 6 * 60 * 60 * 1000

/** Batched GraphQL documents are heavy; two in flight is plenty and stays clear of secondary limits. */
const MAX_BATCH_CONCURRENCY = 2

const boundedIntOr = (fallback: number, min: number, max: number) => (value: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback)

const projectsGitHubEnvConfig = Config.all({
	ttlMs: Config.int("GHUI_PROJECTS_GITHUB_TTL_MS").pipe(Config.withDefault(DEFAULT_TTL_MS), Config.map(boundedIntOr(DEFAULT_TTL_MS, 0, 24 * 60 * 60 * 1000))),
	concurrency: Config.int("GHUI_PROJECTS_GITHUB_CONCURRENCY").pipe(Config.withDefault(DEFAULT_CONCURRENCY), Config.map(boundedIntOr(DEFAULT_CONCURRENCY, 1, 8))),
	batchSize: Config.int("GHUI_PROJECTS_GITHUB_BATCH_SIZE").pipe(Config.withDefault(DEFAULT_BATCH_SIZE), Config.map(boundedIntOr(DEFAULT_BATCH_SIZE, 1, 25))),
})

export interface ProjectsGitHubEnv {
	/** How long a fetched GitHubSnapshot stays usable without re-asking GitHub. 0 disables the memo. */
	readonly ttlMs: number
	/** Max repositories fetched in parallel on the per-repo path. */
	readonly concurrency: number
	/** Repositories per aliased GraphQL document on the batch path. */
	readonly batchSize: number
}

const envFallback: ProjectsGitHubEnv = { ttlMs: DEFAULT_TTL_MS, concurrency: DEFAULT_CONCURRENCY, batchSize: DEFAULT_BATCH_SIZE }

/**
 * Materialized at module load like `config` in src/config.ts, but guarded: a
 * non-numeric GHUI_PROJECTS_GITHUB_* value falls back to defaults instead of
 * throwing during import.
 */
export const projectsGitHubEnv: ProjectsGitHubEnv = Effect.runSync(
	Effect.gen(function* () {
		return yield* projectsGitHubEnvConfig
	}).pipe(Effect.catchCause(() => Effect.succeed(envFallback))),
)

// === Dependency ports ===
//
// Declared structurally rather than as `Context.Service` references so this
// module never touches the Effect runtime: the live `GitHubService`,
// `MockGitHubService` and `CacheService` values are all assignable as-is.

/** The three `GitHubService` methods this module uses. */
export interface ProjectsGitHubService {
	readonly listPullRequestPage: (input: ItemListInput<"pullRequest">) => Effect.Effect<ItemPage<PullRequestItem>, GitHubError>
	readonly getRepositoryDetails: (repository: string) => Effect.Effect<RepositoryDetails, GitHubError>
	readonly listRepositoryWorkflowRuns: (repository: string) => Effect.Effect<readonly WorkflowRun[], GitHubError>
}

/**
 * The `CacheService` slice this module uses. Only `repository_details` is
 * touched — adding a `project_snapshots` table would mean editing upstream's
 * CacheService (migrations + interface + live layer + disabledLayer), which is
 * out of bounds for this fork, so the per-repo GitHubSnapshot memo lives in
 * process instead (see `memo` below).
 */
export interface ProjectsCacheService {
	readonly readRepositoryDetails: (repository: string) => Effect.Effect<RepositoryDetails | null, CacheError>
	readonly readRepositoryDetailsFetchedAt: (repository: string) => Effect.Effect<Date | null, CacheError>
	readonly writeRepositoryDetails: (details: RepositoryDetails) => Effect.Effect<void>
}

/** The `CommandRunner` slice the batched-GraphQL path uses. */
export interface ProjectsCommandRunner {
	readonly runSchema: <S extends Schema.Top>(
		schema: S,
		command: string,
		args: readonly string[],
	) => Effect.Effect<S["Type"], CommandError | JsonParseError | Schema.SchemaError, S["DecodingServices"]>
}

export interface ProjectGitHubDeps {
	readonly github: ProjectsGitHubService
	/** Optional: enables the shared repository-details cache. Absent = every default branch costs a request. */
	readonly cache?: ProjectsCacheService | null
	/**
	 * Optional: enables the batched GraphQL path (~1 request per 10 repositories
	 * instead of 2 per repository) and is the ONLY source of release data.
	 * `githubRuntime` hides CommandRunner (`Layer.provide`, not `provideMerge`),
	 * so a caller that wants this must expose it from its own Atom.runtime.
	 */
	readonly command?: ProjectsCommandRunner | null
}

export interface ProjectGitHubFetchOptions {
	/** Injected for determinism; stamped onto every `GitHubSnapshot.fetchedAt`. */
	readonly now?: Date
	/** Ignore the in-process memo (what the "rescan" command should pass). */
	readonly force?: boolean
	readonly ttlMs?: number
	readonly concurrency?: number
	readonly batchSize?: number
	/** Open PRs fetched per repository. */
	readonly pullRequestLimit?: number
}

export interface ProjectGitHubFetchResult {
	/** Keyed by "owner/repo". A repository is ABSENT when its facts could not be fetched. */
	readonly snapshots: ReadonlyMap<string, GitHubSnapshot>
	/** Non-fatal, user-facing problems. Merge these into `ProjectsReport.warnings`. */
	readonly warnings: readonly string[]
	/** Repositories this call considered (deduped, remote-bearing, well-formed). */
	readonly repositories: readonly string[]
	/** `gh` invocations this call made. Exposed so tests can assert the request budget. */
	readonly requestCount: number
}

// === Small helpers ===

const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

const oneLine = (text: string): string => {
	const collapsed = text.replace(/\s+/g, " ").trim()
	return collapsed.length > 160 ? `${collapsed.slice(0, 157)}…` : collapsed
}

const validDate = (value: Date | null | undefined): Date | null => (value != null && Number.isFinite(value.getTime()) ? value : null)

const parseDate = (value: string | null | undefined): Date | null => (value == null || value.length === 0 ? null : validDate(new Date(value)))

/**
 * The repositories worth asking GitHub about: deduped, in scan order, skipping
 * projects with no remote (constraint: "skip repos whose remote is null") and
 * anything that does not look like `owner/repo` (a non-GitHub or malformed
 * origin the scanner could not normalize).
 *
 * EVERY remote of a clone is included, not just the preferred one: a fork's
 * `upstream` is where a cross-fork pull request's base lives, so a fetch that
 * only covered `origin` would let `aheadNoPr` report "no open PR" for a branch
 * that has one. One extra repository per fork checkout, batched with the rest.
 */
export const projectRepositories = (snapshots: readonly RepoSnapshot[]): readonly string[] => {
	const seen = new Set<string>()
	for (const snapshot of snapshots) {
		const remotes = snapshot.githubRemotes.length > 0 ? snapshot.githubRemotes : snapshot.remote === null ? [] : [snapshot.remote]
		for (const remote of remotes) {
			if (!REPOSITORY_PATTERN.test(remote)) continue
			seen.add(remote)
		}
	}
	return [...seen]
}

const chunk = <A>(values: readonly A[], size: number): readonly (readonly A[])[] => {
	const batches: A[][] = []
	for (let index = 0; index < values.length; index += size) batches.push(values.slice(index, index + size))
	return batches
}

/**
 * True for errors where retrying ANY repository is pointless and rude: the user
 * is offline, unauthenticated, rate limited, or has no `gh`. The fetch stops
 * issuing requests on the first of these and reports one warning rather than N.
 * Mirrors `shouldRetryItemQueueFetch`'s stance in src/item/retry.ts.
 */
export const isFatalGitHubError = (error: unknown): boolean => {
	if (isGitHubRateLimitError(error) || isCommandTimeoutError(error)) return true
	const detail = errorMessage(error).toLowerCase()
	return (
		detail.includes("gh auth login") ||
		detail.includes("not logged in") ||
		detail.includes("bad credentials") ||
		detail.includes("requires authentication") ||
		detail.includes("command not found") ||
		detail.includes("enoent") ||
		detail.includes("no such file or directory") ||
		detail.includes("could not resolve host") ||
		detail.includes("network is unreachable") ||
		detail.includes("connection refused") ||
		detail.includes("dial tcp")
	)
}

const toProjectPullRequest = (item: PullRequestItem): ProjectPullRequest => ({
	number: item.number,
	headRefName: item.headRefName,
	title: item.title,
	url: item.url,
	isDraft: item.reviewStatus === "draft",
	updatedAt: validDate(item.updatedAt),
})

// === In-process memo ===
//
// The stand-in for the CacheService namespace this feature would otherwise add.
// It is per-process (dies with the TUI), which is the right lifetime for "is CI
// red right now"; the durable half — default branches — genuinely does live in
// SQLite, via `repository_details`.

interface MemoEntry {
	readonly snapshot: GitHubSnapshot
	readonly storedAt: number
}

const memo = new Map<string, MemoEntry>()

/** Drop every memoized GitHubSnapshot. For tests and for a hard refresh. */
export const clearProjectGitHubCache = (): void => memo.clear()

const memoRead = (repository: string, ttlMs: number, nowMs: number): GitHubSnapshot | null => {
	if (ttlMs <= 0) return null
	const entry = memo.get(repository)
	if (entry === undefined) return null
	if (nowMs - entry.storedAt >= ttlMs) {
		memo.delete(repository)
		return null
	}
	return entry.snapshot
}

const memoWrite = (snapshot: GitHubSnapshot, nowMs: number): void => {
	memo.set(snapshot.repository, { snapshot, storedAt: nowMs })
}

// === Batched GraphQL (cheap path) ===
//
// One document with one aliased `repository(...)` block per repository. GitHub
// has no multi-repo root field, but aliases cost one HTTP request regardless of
// how many blocks they contain, which turns 20 repositories into 2 requests.

const BATCH_REPOSITORY_FIELDS = `    nameWithOwner
    defaultBranchRef {
      name
      target {
        ... on Commit {
          statusCheckRollup { state }
          checkSuites(first: 20) {
            nodes {
              conclusion
              createdAt
              workflowRun { url createdAt }
            }
          }
        }
      }
    }
    latestRelease { tagName name url publishedAt }
    pullRequests(states: OPEN, first: %PR_LIMIT%, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { number title url isDraft updatedAt headRefName }
      pageInfo { hasNextPage }
    }`

const batchAlias = (index: number) => `r${index}`

/** Exported for tests: the aliased document sent for one batch of repositories. */
export const projectFactsQuery = (repositories: readonly string[], pullRequestLimit: number): string => {
	const fields = BATCH_REPOSITORY_FIELDS.replace("%PR_LIMIT%", String(pullRequestLimit))
	const blocks = repositories.map((repository, index) => {
		// Safe to interpolate: `projectRepositories` already enforced
		// /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, so there is nothing to escape.
		const [owner = "", name = ""] = repository.split("/")
		return `  ${batchAlias(index)}: repository(owner: "${owner}", name: "${name}") {\n${fields}\n  }`
	})
	return `query ProjectFacts {\n${blocks.join("\n")}\n}\n`
}

const BatchPullRequestSchema = Schema.Struct({
	number: Schema.Number,
	title: Schema.String,
	url: Schema.String,
	isDraft: Schema.Boolean,
	updatedAt: Schema.NullOr(Schema.String),
	headRefName: Schema.String,
})

const BatchCheckSuiteSchema = Schema.Struct({
	conclusion: Schema.NullOr(Schema.String),
	createdAt: Schema.NullOr(Schema.String),
	workflowRun: Schema.NullOr(Schema.Struct({ url: Schema.NullOr(Schema.String), createdAt: Schema.NullOr(Schema.String) })),
})

// `target` is a GitObject; the inline fragment yields `{}` when the default
// branch points at something that is not a Commit, hence every key optional.
const BatchCommitSchema = Schema.Struct({
	statusCheckRollup: Schema.optionalKey(Schema.NullOr(Schema.Struct({ state: Schema.NullOr(Schema.String) }))),
	checkSuites: Schema.optionalKey(Schema.NullOr(Schema.Struct({ nodes: Schema.NullOr(Schema.Array(Schema.NullOr(BatchCheckSuiteSchema))) }))),
})

const BatchRepositorySchema = Schema.Struct({
	nameWithOwner: Schema.String,
	defaultBranchRef: Schema.NullOr(Schema.Struct({ name: Schema.String, target: Schema.optionalKey(Schema.NullOr(BatchCommitSchema)) })),
	latestRelease: Schema.NullOr(
		Schema.Struct({
			tagName: Schema.String,
			name: Schema.NullOr(Schema.String),
			url: Schema.NullOr(Schema.String),
			publishedAt: Schema.NullOr(Schema.String),
		}),
	),
	pullRequests: Schema.Struct({
		nodes: Schema.NullOr(Schema.Array(Schema.NullOr(BatchPullRequestSchema))),
		pageInfo: Schema.optionalKey(Schema.NullOr(Schema.Struct({ hasNextPage: Schema.Boolean }))),
	}),
})

const BatchResponseSchema = Schema.Struct({ data: Schema.Record(Schema.String, Schema.NullOr(BatchRepositorySchema)) })

type BatchRepository = Schema.Schema.Type<typeof BatchRepositorySchema>

// CheckSuite.conclusion is the closest thing GitHub exposes to "the workflow
// run's conclusion" without a second REST call, and its enum maps 1:1 onto
// `RunConclusion` — including the two values `ciRed` keys on beyond "failure".
const RUN_CONCLUSION_BY_CHECK_SUITE: Readonly<Record<string, RunConclusion>> = {
	SUCCESS: "success",
	FAILURE: "failure",
	STARTUP_FAILURE: "failure",
	TIMED_OUT: "timed_out",
	ACTION_REQUIRED: "action_required",
	CANCELLED: "cancelled",
	NEUTRAL: "neutral",
	SKIPPED: "skipped",
	STALE: "stale",
}

// Fallback when a repository has commit statuses but no check suites. PENDING /
// EXPECTED stay null — "in flight" is not a failure, and `ciRed` must not fire.
const RUN_CONCLUSION_BY_ROLLUP: Readonly<Record<string, RunConclusion>> = {
	SUCCESS: "success",
	FAILURE: "failure",
	ERROR: "failure",
}

const batchRunFacts = (node: BatchRepository): Pick<GitHubSnapshot, "latestRunConclusion" | "latestRunUrl" | "latestRunAt"> => {
	const target = node.defaultBranchRef?.target ?? null
	const suites = (target?.checkSuites?.nodes ?? [])
		.flatMap((suite) => (suite === null || suite.workflowRun === null ? [] : [suite]))
		.map((suite) => ({ suite, at: parseDate(suite.workflowRun?.createdAt ?? suite.createdAt) }))
		.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
	const latest = suites[0]
	if (latest !== undefined) {
		return {
			latestRunConclusion: latest.suite.conclusion === null ? null : (RUN_CONCLUSION_BY_CHECK_SUITE[latest.suite.conclusion] ?? null),
			latestRunUrl: latest.suite.workflowRun?.url ?? null,
			latestRunAt: latest.at,
		}
	}
	const rollup = target?.statusCheckRollup?.state ?? null
	return {
		latestRunConclusion: rollup === null ? null : (RUN_CONCLUSION_BY_ROLLUP[rollup] ?? null),
		latestRunUrl: null,
		latestRunAt: null,
	}
}

const batchRelease = (node: BatchRepository): ProjectRelease | null => {
	const release = node.latestRelease
	if (release === null) return null
	return { tagName: release.tagName, name: release.name, url: release.url, publishedAt: parseDate(release.publishedAt) }
}

const batchSnapshot = (repository: string, node: BatchRepository, now: Date): GitHubSnapshot => ({
	repository,
	defaultBranch: node.defaultBranchRef?.name ?? null,
	openPullRequests: (node.pullRequests.nodes ?? []).flatMap((pullRequest) =>
		pullRequest === null
			? []
			: [
					{
						number: pullRequest.number,
						headRefName: pullRequest.headRefName,
						title: pullRequest.title,
						url: pullRequest.url,
						isDraft: pullRequest.isDraft,
						updatedAt: parseDate(pullRequest.updatedAt),
					} satisfies ProjectPullRequest,
				],
	),
	pullRequestsTruncated: node.pullRequests.pageInfo?.hasNextPage ?? false,
	...batchRunFacts(node),
	latestRelease: batchRelease(node),
	fetchedAt: now,
})

// === Per-repo path (fallback, and the only path a plain GitHubService can take) ===

const readCachedRepositoryDetails = (cache: ProjectsCacheService | null | undefined, repository: string, nowMs: number) =>
	Effect.gen(function* () {
		if (cache == null) return { details: null, fresh: false } as const
		const details = yield* cache.readRepositoryDetails(repository).pipe(Effect.catchCause(() => Effect.succeed(null)))
		if (details === null) return { details: null, fresh: false } as const
		const fetchedAt = yield* cache.readRepositoryDetailsFetchedAt(repository).pipe(Effect.catchCause(() => Effect.succeed(null)))
		return { details, fresh: fetchedAt !== null && nowMs - fetchedAt.getTime() < REPOSITORY_DETAILS_TTL_MS } as const
	})

interface FetchState {
	/** Set once an error means "stop asking GitHub anything at all". */
	fatal: string | null
	/**
	 * Single-repository batches that still failed. A couple of those are normal
	 * (deleted remotes); a run of them means the document itself is rejected, so
	 * batching is abandoned before the binary split can burn 2N requests.
	 */
	singleFailures: number
	batchDisabled: boolean
	requestCount: number
}

/** How many lone-repository batch failures it takes to write the batch path off for this run. */
const MAX_SINGLE_BATCH_FAILURES = 3

interface RepoOutcome {
	readonly snapshot: GitHubSnapshot | null
	readonly warning: string | null
}

const skipped: RepoOutcome = { snapshot: null, warning: null }

/**
 * Facts for one repository using only the upstream GitHubService.
 *
 * Order is chosen to minimise requests: open PRs come first because they are
 * mandatory AND they carry `defaultBranchName`, so a repository with any open
 * PR never needs a repository-details call. Runs are skipped entirely when the
 * default branch is unknown — reporting "latest run on some branch" would be a
 * lie, and it saves a spawn.
 */
const fetchRepositoryViaService = (repository: string, deps: ProjectGitHubDeps, state: FetchState, now: Date, pullRequestLimit: number): Effect.Effect<RepoOutcome> =>
	Effect.gen(function* () {
		if (state.fatal !== null) return skipped

		const cached = yield* readCachedRepositoryDetails(deps.cache, repository, now.getTime())

		state.requestCount += 1
		const page = yield* deps.github.listPullRequestPage({ kind: "pullRequest", mode: "all", repository, cursor: null, pageSize: pullRequestLimit }).pipe(
			Effect.map((value) => ({ ok: true as const, value })),
			Effect.catchCause((cause) => Effect.succeed({ ok: false as const, error: Cause.squash(cause) })),
		)

		if (!page.ok) {
			// A 404 here is the common "remote was deleted or renamed" case: report
			// it against this repository and keep going with the others.
			if (isFatalGitHubError(page.error)) {
				state.fatal = oneLine(errorMessage(page.error))
				return skipped
			}
			return { snapshot: null, warning: `${repository}: ${oneLine(errorMessage(page.error))}` }
		}

		const openPullRequests = page.value.items.filter((item) => item.state === "open")

		let defaultBranch: string | null = cached.fresh ? (cached.details?.defaultBranch ?? null) : null
		if (defaultBranch === null) defaultBranch = openPullRequests[0]?.defaultBranchName ?? null
		if (defaultBranch === null) defaultBranch = cached.details?.defaultBranch ?? null
		if (defaultBranch === null && state.fatal === null) {
			state.requestCount += 1
			const details = yield* deps.github.getRepositoryDetails(repository).pipe(Effect.catchCause(() => Effect.succeed(null)))
			if (details !== null) {
				defaultBranch = details.defaultBranch
				if (deps.cache != null) yield* deps.cache.writeRepositoryDetails(details).pipe(Effect.catchCause(() => Effect.void))
			}
		}

		let latestRun: WorkflowRun | null = null
		if (defaultBranch !== null && state.fatal === null) {
			state.requestCount += 1
			// `gh run list` is newest-first (parseWorkflowRuns sorts it) across all
			// branches, so the first match on the default branch is the latest run.
			// An Actions-less repository just yields an empty list.
			const runs = yield* deps.github.listRepositoryWorkflowRuns(repository).pipe(Effect.catchCause(() => Effect.succeed<readonly WorkflowRun[]>([])))
			latestRun = runs.find((run) => run.headBranch === defaultBranch) ?? null
		}

		return {
			snapshot: {
				repository,
				defaultBranch,
				openPullRequests: openPullRequests.map(toProjectPullRequest),
				// `listPullRequestPage({ mode: "all", repository })` runs
				// `repositoryPullRequestsQuery`, i.e. `pullRequests(states: OPEN, …)`,
				// so another page means genuinely more OPEN pull requests.
				pullRequestsTruncated: page.value.hasNextPage,
				latestRunConclusion: latestRun?.conclusion ?? null,
				latestRunUrl: latestRun?.url ?? null,
				latestRunAt: validDate(latestRun?.updatedAt ?? latestRun?.startedAt ?? latestRun?.createdAt ?? null),
				// Releases are only available on the batched GraphQL path; absent is
				// legal here and no check reads this field.
				latestRelease: null,
				fetchedAt: now,
			},
			warning: null,
		}
	}).pipe(Effect.catchCause((cause) => Effect.succeed({ snapshot: null, warning: `${repository}: ${oneLine(errorMessage(Cause.squash(cause)))}` })))

// === Batch driver ===

/**
 * Fetch one batch. `gh api graphql` exits non-zero when the response carries
 * ANY GraphQL error, so a single missing repository would otherwise poison the
 * whole document — hence the binary split: halve the batch and retry until the
 * offender is alone, then leave it to the per-repo path (which turns it into a
 * precise warning). Fatal errors short-circuit instead of fanning out.
 */
const fetchBatch = (
	command: ProjectsCommandRunner,
	repositories: readonly string[],
	state: FetchState,
	now: Date,
	pullRequestLimit: number,
): Effect.Effect<readonly GitHubSnapshot[]> =>
	Effect.gen(function* () {
		if (repositories.length === 0 || state.fatal !== null || state.batchDisabled) return []

		state.requestCount += 1
		const response = yield* command.runSchema(BatchResponseSchema, "gh", ["api", "graphql", "-f", `query=${projectFactsQuery(repositories, pullRequestLimit)}`]).pipe(
			Effect.map((value) => ({ ok: true as const, value })),
			Effect.catchCause((cause) => Effect.succeed({ ok: false as const, error: Cause.squash(cause) })),
		)

		if (response.ok) {
			return repositories.flatMap((repository, index) => {
				const node = response.value.data[batchAlias(index)]
				return node == null ? [] : [batchSnapshot(repository, node, now)]
			})
		}

		if (isFatalGitHubError(response.error)) {
			state.fatal = oneLine(errorMessage(response.error))
			return []
		}
		if (repositories.length === 1) {
			state.singleFailures += 1
			if (state.singleFailures >= MAX_SINGLE_BATCH_FAILURES) state.batchDisabled = true
			return []
		}

		const middle = Math.ceil(repositories.length / 2)
		const halves = yield* Effect.forEach([repositories.slice(0, middle), repositories.slice(middle)], (half) => fetchBatch(command, half, state, now, pullRequestLimit), {
			concurrency: 1,
		})
		return halves.flat()
	}).pipe(Effect.catchCause(() => Effect.succeed<readonly GitHubSnapshot[]>([])))

// === Entry point ===

/**
 * Remote facts for every project with a GitHub remote.
 *
 * Pure in the sense that matters: services come in as arguments, `now` is
 * injectable, and nothing is read from a runtime — so a test can hand it
 * `MockGitHubService.layer({...})`'s service value directly and assert both the
 * returned map and `requestCount`.
 *
 * NEVER FAILS (`E = never`, `R = never`). Repositories whose facts could not be
 * fetched are simply absent from `snapshots`; the reason is in `warnings`.
 */
export const fetchProjectGitHubSnapshots = (
	snapshots: readonly RepoSnapshot[],
	deps: ProjectGitHubDeps,
	options: ProjectGitHubFetchOptions = {},
): Effect.Effect<ProjectGitHubFetchResult> =>
	Effect.gen(function* () {
		const now = options.now ?? new Date()
		const nowMs = now.getTime()
		const ttlMs = options.ttlMs ?? projectsGitHubEnv.ttlMs
		const concurrency = Math.max(1, options.concurrency ?? projectsGitHubEnv.concurrency)
		const batchSize = Math.max(1, options.batchSize ?? projectsGitHubEnv.batchSize)
		const pullRequestLimit = Math.max(1, Math.min(100, options.pullRequestLimit ?? DEFAULT_PULL_REQUEST_LIMIT))

		const repositories = projectRepositories(snapshots)
		const resolved = new Map<string, GitHubSnapshot>()
		const warnings: string[] = []
		const state: FetchState = { fatal: null, singleFailures: 0, batchDisabled: false, requestCount: 0 }

		if (repositories.length === 0) return { snapshots: resolved, warnings, repositories, requestCount: 0 }

		// 1. Memo — a rescan inside the TTL costs nothing at all.
		const pending: string[] = []
		for (const repository of repositories) {
			const memoized = options.force === true ? null : memoRead(repository, ttlMs, nowMs)
			if (memoized === null) pending.push(repository)
			else resolved.set(repository, memoized)
		}

		// 2. Batched GraphQL, when a CommandRunner was supplied.
		const fetched: GitHubSnapshot[] = []
		const command = deps.command ?? null
		if (pending.length > 0 && command !== null) {
			const results = yield* Effect.forEach(chunk(pending, batchSize), (batch) => fetchBatch(command, batch, state, now, pullRequestLimit), {
				concurrency: Math.min(MAX_BATCH_CONCURRENCY, concurrency),
			})
			for (const snapshot of results.flat()) {
				resolved.set(snapshot.repository, snapshot)
				fetched.push(snapshot)
			}
		}

		// 3. Anything the batch could not answer (or every repository, when there is
		//    no CommandRunner) goes through the per-repo GitHubService path.
		const remaining = pending.filter((repository) => !resolved.has(repository))
		if (remaining.length > 0 && state.fatal === null) {
			const outcomes = yield* Effect.forEach(remaining, (repository) => fetchRepositoryViaService(repository, deps, state, now, pullRequestLimit), { concurrency })
			for (const outcome of outcomes) {
				if (outcome.snapshot !== null) {
					resolved.set(outcome.snapshot.repository, outcome.snapshot)
					fetched.push(outcome.snapshot)
				}
				if (outcome.warning !== null) warnings.push(outcome.warning)
			}
		}

		// 4. One warning for a global outage, not one per repository.
		if (state.fatal !== null) {
			const missing = repositories.filter((repository) => !resolved.has(repository)).length
			warnings.push(`GitHub data unavailable for ${missing} ${missing === 1 ? "project" : "projects"}: ${state.fatal}`)
		}

		// Only what this call actually fetched. Re-stamping memo HITS would turn the
		// fixed TTL into a sliding one: poll every 9 minutes with a 10-minute TTL
		// and `storedAt` never ages out, so a snapshot is served forever and
		// `fetchedAt` freezes at the first fetch.
		for (const snapshot of fetched) memoWrite(snapshot, nowMs)

		return { snapshots: resolved, warnings, repositories, requestCount: state.requestCount }
	}).pipe(
		// Belt and braces: the contract is E = never, and a defect anywhere above
		// must still leave the Projects surface with its local findings.
		Effect.catchCause((cause) =>
			Effect.succeed<ProjectGitHubFetchResult>({
				snapshots: new Map(),
				warnings: [`GitHub data unavailable: ${oneLine(errorMessage(Cause.squash(cause)))}`],
				repositories: projectRepositories(snapshots),
				requestCount: 0,
			}),
		),
	)
