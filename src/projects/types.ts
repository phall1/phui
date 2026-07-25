// === Projects: the portfolio-linter domain ===
//
// The Projects surface is a "doctor" for local repositories, not a dashboard:
// a scanner gathers facts once, pure checks turn those facts into Findings, and
// the UI renders only the Findings. Everything in this file is data — no IO, no
// Effect, no React — so checks stay trivially testable.
//
// The contract has three layers:
//   RepoSnapshot   — local git facts (the scanner shells out; checks never do)
//   GitHubSnapshot — remote facts, always optional so the feature degrades to
//                    local-only when `gh` is missing, unauthenticated or offline
//   Finding        — the only thing the UI ever renders
//
// NOTE: types-only module. Keep it importable from anywhere without pulling in
// the Effect runtime.

import type { RunConclusion } from "../domain.js"

// === Intent ===
//
// The user's hand-written note about what a project IS to them, read from the
// `[intent]` table of their projects.toml. Never committed, never inferred.

export const projectLifecycles = ["alive", "parked", "shipped", "dead"] as const

export type ProjectLifecycle = (typeof projectLifecycles)[number]

export const isProjectLifecycle = (value: unknown): value is ProjectLifecycle => typeof value === "string" && (projectLifecycles as readonly string[]).includes(value)

export interface ProjectIntent {
	readonly lifecycle: ProjectLifecycle
	readonly note?: string
}

/** Build a ProjectIntent without fighting `exactOptionalPropertyTypes`. */
export const projectIntent = (lifecycle: ProjectLifecycle, note?: string | null): ProjectIntent => ({
	lifecycle,
	...(note === undefined || note === null || note.length === 0 ? {} : { note }),
})

/**
 * Checks that only care whether a project is still worth nagging about should
 * gate on this rather than comparing lifecycles inline.
 */
export const isActiveLifecycle = (lifecycle: ProjectLifecycle): boolean => lifecycle === "alive" || lifecycle === "parked"

// === Local git facts ===

/**
 * One entry from `git worktree list --porcelain`, including the main worktree.
 * `prunable` mirrors git's own verdict so the staleWorktrees check never has to
 * re-derive it.
 */
export interface Worktree {
	readonly path: string
	readonly branch: string | null
	readonly headSha: string | null
	readonly isMain: boolean
	readonly isBare: boolean
	readonly isDetached: boolean
	readonly isLocked: boolean
	readonly lockReason: string | null
	/** git reports this worktree as prunable (`git worktree list --porcelain` line `prunable <reason>`). */
	readonly isPrunable: boolean
	readonly prunableReason: string | null
	/** The worktree directory no longer exists on disk. */
	readonly isMissing: boolean
}

/**
 * Everything the scanner learns about one directory under a scan root, gathered
 * in a single pass. Checks receive these and MUST NOT shell out again — if a
 * check needs a new fact, add a field here and teach the scanner to fill it.
 *
 * A directory that is not a git repository still gets a snapshot (that is what
 * the `notARepo` check reads); all git-specific fields are then inert defaults.
 */
export interface RepoSnapshot {
	/** Absolute path to the directory. Stable identity for a project. */
	readonly path: string
	/** Directory basename, e.g. "ghui". Also the key used for `[intent]` lookups. */
	readonly name: string
	/** The configured scan root this directory was found under (absolute). */
	readonly scanRoot: string
	readonly isGitRepo: boolean
	/** Current branch name, or null when detached / unborn HEAD / not a repo. */
	readonly currentBranch: string | null
	readonly detachedHead: boolean
	/** Number of entries reported by `git status --porcelain` (staged + unstaged + untracked). */
	readonly dirtyCount: number
	/** Commits on the current branch not on its upstream. 0 when there is no upstream. */
	readonly ahead: number
	/** Commits on the upstream not on the current branch. 0 when there is no upstream. */
	readonly behind: number
	/** Upstream tracking ref, e.g. "origin/main". Null when the branch has no upstream. */
	readonly upstreamRef: string | null
	/** Author date of HEAD. Null for an empty repo or a non-repo. */
	readonly lastCommitAt: Date | null
	/** Pre-rendered relative age from git, e.g. "3 weeks ago". Null when there is no commit. */
	readonly lastCommitRelative: string | null
	/** Normalized "owner/repo" for a github.com origin. Null for non-GitHub or missing remotes. */
	readonly remote: string | null
	/**
	 * EVERY distinct "owner/repo" this clone has a remote for, preferred first
	 * (`githubRemotes[0] === remote`). A fork clone lists its own repository AND
	 * the parent, so a check can tell whether the PR data it was handed covers
	 * the repository a cross-fork pull request would actually live in.
	 */
	readonly githubRemotes: readonly string[]
	/** Raw origin URL exactly as configured (ssh or https). Null when there is no origin. */
	readonly remoteUrl: string | null
	readonly worktrees: readonly Worktree[]
	readonly stashCount: number
	/** Set when the scanner could not inspect the directory (permissions, broken repo). Checks should skip such entries. */
	readonly scanError: string | null
}

/** An inert snapshot for a directory that is not a git repository. */
export const nonRepoSnapshot = (path: string, name: string, scanRoot: string, scanError: string | null = null): RepoSnapshot => ({
	path,
	name,
	scanRoot,
	isGitRepo: false,
	currentBranch: null,
	detachedHead: false,
	dirtyCount: 0,
	ahead: 0,
	behind: 0,
	upstreamRef: null,
	lastCommitAt: null,
	lastCommitRelative: null,
	remote: null,
	githubRemotes: [],
	remoteUrl: null,
	worktrees: [],
	stashCount: 0,
	scanError,
})

// === Remote (GitHub) facts ===

export interface ProjectPullRequest {
	readonly number: number
	/** Head branch name (unqualified, e.g. "feat/x") — compare against RepoSnapshot.currentBranch. */
	readonly headRefName: string
	readonly title: string
	readonly url: string
	readonly isDraft: boolean
	readonly updatedAt: Date | null
}

export interface ProjectRelease {
	readonly tagName: string
	readonly name: string | null
	readonly url: string | null
	readonly publishedAt: Date | null
}

/**
 * Remote facts for one "owner/repo". Every field is absent-tolerant: an empty
 * `openPullRequests`, a null `defaultBranch` and a null `latestRunConclusion`
 * are all legal and simply mean "unknown". Checks that need remote data must
 * bail out when `snapshot.github` is undefined rather than assuming a value.
 */
export interface GitHubSnapshot {
	/** "owner/repo" — matches RepoSnapshot.remote. */
	readonly repository: string
	readonly defaultBranch: string | null
	readonly openPullRequests: readonly ProjectPullRequest[]
	/**
	 * True when GitHub had MORE open pull requests than we asked for, so
	 * `openPullRequests` is a page rather than the whole set. A check may not
	 * conclude "there is no PR for this branch" from a truncated list.
	 */
	readonly pullRequestsTruncated: boolean
	/** Latest CI conclusion on the default branch. null = no run / still running / unknown. */
	readonly latestRunConclusion: RunConclusion
	readonly latestRunUrl: string | null
	readonly latestRunAt: Date | null
	readonly latestRelease: ProjectRelease | null
	/** When these remote facts were fetched; drives cache-staleness copy in the UI. */
	readonly fetchedAt: Date
}

// === The unit checks operate on ===

export interface ProjectSnapshot {
	readonly repo: RepoSnapshot
	/** Facts for `repo.remote` — the preferred remote. Absent when there is no GitHub remote, no auth, or the fetch failed. */
	readonly github?: GitHubSnapshot
	/**
	 * Facts for the repo's OTHER GitHub remotes (a fork's `upstream`). A PR
	 * opened from a fork has its base in the PARENT repository, so it appears
	 * only in the parent's pull-request connection — not in the fork's.
	 */
	readonly relatedGitHub?: readonly GitHubSnapshot[]
	/** Absent when the user wrote no `[intent]` entry for this project. */
	readonly intent?: ProjectIntent
}

/** Build a ProjectSnapshot from nullable parts (conditional spread, per `exactOptionalPropertyTypes`). */
export const projectSnapshot = (
	repo: RepoSnapshot,
	github?: GitHubSnapshot | null,
	intent?: ProjectIntent | null,
	relatedGitHub?: readonly GitHubSnapshot[] | null,
): ProjectSnapshot => ({
	repo,
	...(github === undefined || github === null ? {} : { github }),
	...(intent === undefined || intent === null ? {} : { intent }),
	...(relatedGitHub === undefined || relatedGitHub === null || relatedGitHub.length === 0 ? {} : { relatedGitHub }),
})

/** Every GitHub repository we actually hold facts for, preferred remote first. */
export const githubSnapshots = (snapshot: ProjectSnapshot): readonly GitHubSnapshot[] => [
	...(snapshot.github === undefined ? [] : [snapshot.github]),
	...(snapshot.relatedGitHub ?? []),
]

/**
 * The open PR whose head branch is `branch`, or null. Used by aheadNoPr.
 *
 * Searches every remote of the clone, not just `origin`: on a fork checkout the
 * PR lives in the parent repository's connection.
 */
export const openPullRequestForBranch = (snapshot: ProjectSnapshot, branch: string | null): ProjectPullRequest | null => {
	if (branch === null) return null
	for (const github of githubSnapshots(snapshot)) {
		const found = github.openPullRequests.find((pullRequest) => pullRequest.headRefName === branch)
		if (found !== undefined) return found
	}
	return null
}

/**
 * True when "this branch has no open pull request" is a claim we are ENTITLED to
 * make: we hold a complete open-PR list for every GitHub remote of the clone.
 *
 * False when a list was truncated (more open PRs than we asked for) or when a
 * remote — typically a fork's `upstream`, which is where a cross-fork PR's base
 * lives — could not be fetched. Absence of evidence is not evidence of absence;
 * checks must stay silent rather than guess.
 */
export const hasCompletePullRequestEvidence = (snapshot: ProjectSnapshot): boolean => {
	const fetched = githubSnapshots(snapshot)
	if (fetched.length === 0) return false
	if (fetched.some((github) => github.pullRequestsTruncated)) return false
	return snapshot.repo.githubRemotes.every((remote) => fetched.some((github) => github.repository === remote))
}

// === Findings ===

export const checkIds = ["dirtyAndStale", "aheadNoPr", "dupRemotes", "notARepo", "ciRed", "staleWorktrees"] as const

export type CheckId = (typeof checkIds)[number]

/**
 * Ordered MOST severe first. `severityRank` is the single source of truth for
 * ordering — never compare severity strings directly.
 */
export const findingSeverities = ["error", "warning", "info"] as const

export type FindingSeverity = (typeof findingSeverities)[number]

export const severityRank: Record<FindingSeverity, number> = {
	error: 0,
	warning: 1,
	info: 2,
}

export const isMoreSevere = (a: FindingSeverity, b: FindingSeverity): boolean => severityRank[a] < severityRank[b]

export interface Finding {
	/** Stable across rescans: `${checkId}:${projectPath}` plus an optional discriminator. See `findingId`. */
	readonly id: string
	readonly checkId: CheckId
	readonly severity: FindingSeverity
	/** Absolute path of the project this finding is about. */
	readonly projectPath: string
	/** Directory basename, for display. */
	readonly projectName: string
	/** One short line, e.g. "Dirty and stale". */
	readonly title: string
	/** One line of specifics, e.g. "7 uncommitted files, last commit 42 days ago". */
	readonly detail: string
	/** What to do about it, e.g. "git commit or git stash". */
	readonly suggestion?: string
	/** Something to open (PR, run, release). The UI binds this to its open action. */
	readonly url?: string
	/** Other project paths implicated by this finding (dupRemotes lists its siblings here). */
	readonly relatedPaths?: readonly string[]
}

/** Deterministic, rescan-stable finding id. `discriminator` disambiguates several findings from one check on one project. */
export const findingId = (checkId: CheckId, projectPath: string, discriminator?: string): string =>
	discriminator === undefined || discriminator.length === 0 ? `${checkId}:${projectPath}` : `${checkId}:${projectPath}:${discriminator}`

export interface FindingInput {
	readonly checkId: CheckId
	readonly severity: FindingSeverity
	readonly project: Pick<RepoSnapshot, "path" | "name">
	readonly title: string
	readonly detail: string
	readonly suggestion?: string | null
	readonly url?: string | null
	readonly relatedPaths?: readonly string[] | null
	readonly discriminator?: string
}

/** Construct a Finding; handles the optional-field spread so checks stay one-liners. */
export const makeFinding = (input: FindingInput): Finding => ({
	id: findingId(input.checkId, input.project.path, input.discriminator),
	checkId: input.checkId,
	severity: input.severity,
	projectPath: input.project.path,
	projectName: input.project.name,
	title: input.title,
	detail: input.detail,
	...(input.suggestion === undefined || input.suggestion === null ? {} : { suggestion: input.suggestion }),
	...(input.url === undefined || input.url === null ? {} : { url: input.url }),
	...(input.relatedPaths === undefined || input.relatedPaths === null || input.relatedPaths.length === 0 ? {} : { relatedPaths: input.relatedPaths }),
})

/** Severity first (most severe first), then project name, then check id — a total, stable order. */
export const compareFindings = (a: Finding, b: Finding): number =>
	severityRank[a.severity] - severityRank[b.severity] || a.projectName.localeCompare(b.projectName) || a.checkId.localeCompare(b.checkId) || a.id.localeCompare(b.id)

export const sortFindings = (findings: readonly Finding[]): readonly Finding[] => [...findings].sort(compareFindings)

// === Checks ===

/**
 * Everything a check is allowed to know beyond the snapshots themselves. Kept
 * to primitives (not the whole ProjectsConfig) so this module never imports
 * config.ts — checks stay pure data-in/data-out.
 */
export interface CheckContext {
	/** Injected so tests are deterministic; never call `new Date()` inside a check. */
	readonly now: Date
	/** Days without a commit before "stale" applies. */
	readonly staleDays: number
	/** Where the user's projects.toml lives (or would live). For suggestion copy only. */
	readonly configPath: string | null
}

/**
 * A check is SYNCHRONOUS on purpose: by the time it runs, every fact it could
 * need is already in the snapshots, so there is no IO to sequence, no error
 * channel to thread and no runtime to provide. That keeps each check module a
 * pure function testable with a plain `expect(check.run(fixtures, ctx))`, and
 * lets the runner fold all checks with a flatMap. Anything that needs IO
 * belongs in the scanner, not in a check.
 */
export interface Check {
	readonly id: CheckId
	/** Human title for the section header, e.g. "Dirty and stale". */
	readonly title: string
	/** One-line explanation of what the check looks for. */
	readonly description: string
	/** Severity a check emits by default; individual findings may still differ. */
	readonly defaultSeverity: FindingSeverity
	/** Whether this check needs `snapshot.github` (the runner may skip it entirely when offline). */
	readonly requiresGitHub: boolean
	readonly run: (snapshots: readonly ProjectSnapshot[], ctx: CheckContext) => readonly Finding[]
}

/** Identity helper so check modules get inference and a single import. */
export const defineCheck = (check: Check): Check => check

// === Report ===

export interface ProjectsReport {
	/** All findings, already sorted with `compareFindings`. */
	readonly findings: readonly Finding[]
	/** Every project that was scanned, in scan order. */
	readonly projects: readonly ProjectSnapshot[]
	/** Check ids that ran (excludes ones skipped for lack of GitHub data). */
	readonly ranCheckIds: readonly CheckId[]
	/** Non-fatal problems worth showing: unreadable config, unreachable root, `gh` unavailable. */
	readonly warnings: readonly string[]
	readonly scannedAt: Date
}

export const emptyProjectsReport = (scannedAt: Date, warnings: readonly string[] = []): ProjectsReport => ({
	findings: [],
	projects: [],
	ranCheckIds: [],
	warnings,
	scannedAt,
})

/** True when there is nothing to nag about — the UI's "all clear" state. */
export const isAllClear = (report: ProjectsReport): boolean => report.findings.length === 0

export const findingsForProject = (report: ProjectsReport, projectPath: string): readonly Finding[] => report.findings.filter((finding) => finding.projectPath === projectPath)

export const countBySeverity = (findings: readonly Finding[]): Record<FindingSeverity, number> => {
	const counts: Record<FindingSeverity, number> = { error: 0, warning: 0, info: 0 }
	for (const finding of findings) counts[finding.severity] += 1
	return counts
}
