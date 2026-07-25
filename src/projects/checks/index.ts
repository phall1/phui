// === Check registry + runner ===
//
// The registry is the ordered list of every check; the runner folds them over the
// snapshots and hands back findings already sorted, because `ProjectsReport` is
// documented as sorted and no consumer should have to remember that.
//
// Both are trivial by design: checks are synchronous pure functions, so running
// them is a flatMap with no concurrency policy, no error channel and no runtime.
// Everything nondeterministic (the clock, the stale threshold) arrives through
// `CheckContext`.

import { sortFindings, type Check, type CheckContext, type CheckId, type Finding, type ProjectSnapshot } from "../types.js"
import { aheadNoPrCheck } from "./aheadNoPr.js"
import { ciRedCheck } from "./ciRed.js"
import { dirtyAndStaleCheck } from "./dirtyAndStale.js"
import { dupRemotesCheck } from "./dupRemotes.js"
import { notARepoCheck } from "./notARepo.js"
import { staleWorktreesCheck } from "./staleWorktrees.js"

export { aheadNoPrCheck } from "./aheadNoPr.js"
export { ciRedCheck } from "./ciRed.js"
export { dirtyAndStaleCheck } from "./dirtyAndStale.js"
export { dupRemotesCheck } from "./dupRemotes.js"
export { notARepoCheck } from "./notARepo.js"
export { staleWorktreesCheck } from "./staleWorktrees.js"
export { MAJOR, MINOR } from "./shared.js"

/**
 * Run order, most consequential first. This is NOT `checkIds` order — that tuple
 * is a stable id vocabulary; this is the order findings are produced in, which
 * only shows through as the tiebreak among equally-severe findings on the same
 * project.
 */
export const projectChecks: readonly Check[] = [dirtyAndStaleCheck, aheadNoPrCheck, ciRedCheck, dupRemotesCheck, staleWorktreesCheck, notARepoCheck]

export const checkById = (id: CheckId): Check | null => projectChecks.find((check) => check.id === id) ?? null

/** True when at least one snapshot carries remote facts, i.e. the GitHub-dependent checks have something to say. */
export const hasGitHubData = (snapshots: readonly ProjectSnapshot[]): boolean => snapshots.some((snapshot) => snapshot.github !== undefined)

export interface RunChecksOptions {
	/** Override the registry (tests, or a user-configured subset). Defaults to `projectChecks`. */
	readonly checks?: readonly Check[]
	/** Defaults to `hasGitHubData(snapshots)`. Set false to force a local-only run. */
	readonly githubAvailable?: boolean
}

/**
 * The checks that will actually run for these snapshots. Checks with
 * `requiresGitHub` are dropped entirely when there are no remote facts — they
 * would be silent anyway, but dropping them lets the caller populate
 * `ProjectsReport.ranCheckIds` honestly, so the UI can say "CI checks skipped"
 * instead of implying all-clear.
 */
export const selectChecks = (snapshots: readonly ProjectSnapshot[], options: RunChecksOptions = {}): readonly Check[] => {
	const checks = options.checks ?? projectChecks
	const githubAvailable = options.githubAvailable ?? hasGitHubData(snapshots)
	return githubAvailable ? checks : checks.filter((check) => !check.requiresGitHub)
}

/** Ids of the checks `runChecks` would run — feed this straight into `ProjectsReport.ranCheckIds`. */
export const runCheckIds = (snapshots: readonly ProjectSnapshot[], options: RunChecksOptions = {}): readonly CheckId[] => selectChecks(snapshots, options).map((check) => check.id)

/** Every finding for these snapshots, sorted by severity, then project name, then check. */
export const runChecks = (snapshots: readonly ProjectSnapshot[], ctx: CheckContext, options: RunChecksOptions = {}): readonly Finding[] =>
	sortFindings(selectChecks(snapshots, options).flatMap((check) => check.run(snapshots, ctx)))
