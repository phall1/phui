// === Shared check helpers ===
//
// Everything here is a pure function over the data in `../types.js`. Checks import
// from this module rather than duplicating filter/format logic, so the three rules
// that apply to EVERY check live in exactly one place:
//
//   1. a directory the scanner could not inspect is never reported on
//      (absence of a fact is not evidence of a problem)
//   2. a project the user marked "shipped" or "dead" is not nagged about
//   3. the "major"/"minor" vocabulary the checks were specced in maps onto the
//      Finding contract's three severities in one place — see below

import { isActiveLifecycle, type FindingSeverity, type ProjectSnapshot } from "../types.js"

/**
 * The severity mapping, isolated on purpose.
 *
 * The checks were specced as "major"/"minor" while `Finding` carries three
 * severities. Major findings are things with work or breakage behind them
 * (uncommitted code sitting for weeks, unshared commits, red CI, two clones of
 * one repo where one is dirty); minor findings are tidiness (a stray directory,
 * a worktree git already considers prunable). `info` is deliberately left free
 * for future purely-FYI checks. Change these two constants and every check moves
 * with them.
 */
export const MAJOR: FindingSeverity = "error"
export const MINOR: FindingSeverity = "warning"

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The user's `[intent]` entry is an override on the nagging, not a label: marking
 * a project "shipped" or "dead" opts it out of every check. Projects with no
 * intent entry are treated as active.
 */
export const isNaggable = (snapshot: ProjectSnapshot): boolean => snapshot.intent === undefined || isActiveLifecycle(snapshot.intent.lifecycle)

/**
 * The scanner sets `scanError` when it could not inspect a directory (permissions,
 * a broken repo). Every field on such a snapshot is an inert default, so reporting
 * on one would be reporting on the absence of data. Always skip them.
 */
export const isInspectable = (snapshot: ProjectSnapshot): boolean => snapshot.repo.scanError === null

/** The snapshots every git-fact check operates on: inspectable, a real repo, and still worth nagging about. */
export const gitRepos = (snapshots: readonly ProjectSnapshot[]): readonly ProjectSnapshot[] =>
	snapshots.filter((snapshot) => isInspectable(snapshot) && snapshot.repo.isGitRepo && isNaggable(snapshot))

/** Fractional days between two instants, clamped at 0 so clock skew never renders a negative age. */
export const ageInDays = (from: Date, now: Date): number => Math.max(0, (now.getTime() - from.getTime()) / DAY_MS)

export const plural = (count: number, singular: string, pluralForm = `${singular}s`): string => `${count} ${count === 1 ? singular : pluralForm}`

/**
 * Compact whole-unit duration for finding copy ("3 weeks", "5 months"). A linter
 * line is not a stopwatch, so precision below the leading unit is dropped.
 */
export const describeAge = (days: number): string => {
	if (days < 1) return "less than a day"
	if (days < 14) return plural(Math.floor(days), "day")
	if (days < 60) return plural(Math.floor(days / 7), "week")
	if (days < 365) return plural(Math.floor(days / 30), "month")
	return plural(Math.floor(days / 365), "year")
}
