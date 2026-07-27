// === Raw git invocation + porcelain parsers for the Projects scanner ===
//
// This module is the ONLY place the Projects feature shells out to git. It has
// two halves, kept apart on purpose:
//
//   1. `runGit` — one `Bun.spawn` per call (the `src/services/CommandRunner.ts`
//      shape: abort-on-interrupt + `Effect.timeoutOrElse`), which NEVER fails.
//      Every failure mode a scan can hit — git not installed, a directory that
//      vanished mid-scan, EACCES, a hung `git status` on a network mount — comes
//      back as a `GitResult` with `ok: false` so the caller can degrade instead
//      of the whole surface erroring out.
//   2. The `parse*` functions — pure, synchronous, string-in/data-out, so the
//      porcelain formats can be tested against captured fixtures without a git
//      binary or a temp directory anywhere in sight.
//
// Remote URL parsing is NOT reimplemented here: `parseGitRemoteUrl` from
// `src/gitRemotes.ts` is the one owner of that regex.

import { existsSync } from "node:fs"
import { Effect } from "effect"
import { config } from "../config.js"
import { errorMessage } from "../errors.js"
import { parseGitRemoteUrl } from "../gitRemotes.js"
import type { Worktree } from "./types.js"

// === Invocation ===

export interface GitResult {
	readonly ok: boolean
	readonly stdout: string
	readonly stderr: string
	/** -1 when the process could not be spawned or was killed by the timeout. */
	readonly exitCode: number
	readonly timedOut: boolean
}

const gitFailure = (detail: string, timedOut: boolean): GitResult => ({ ok: false, stdout: "", stderr: detail, exitCode: -1, timedOut })

/**
 * Scanning is a read-only observation of someone else's working copies, so:
 *   GIT_OPTIONAL_LOCKS=0   never take the index lock / never write a refreshed
 *                          index into a repo the user is also working in
 *   GIT_TERMINAL_PROMPT=0  a repo with a credential-requiring remote must fail
 *                          fast rather than block on a prompt behind the TUI
 *   LC_ALL=C               keep `%ar` ("3 weeks ago") and error text parseable
 */
const gitEnv = (): Record<string, string | undefined> => ({
	...process.env,
	GIT_OPTIONAL_LOCKS: "0",
	GIT_TERMINAL_PROMPT: "0",
	GIT_PAGER: "cat",
	LC_ALL: "C",
})

const readStream = async (stream: ReadableStream | null | undefined) => {
	if (!stream) return ""
	return Bun.readableStreamToText(stream)
}

/**
 * Run one git command in `cwd`. Never fails and never throws — inspect
 * `result.ok`. A hung git is killed at `timeoutMs` (defaults to the same
 * `PHUI_COMMAND_TIMEOUT_MS` knob every other subprocess in the app uses) so a
 * single bad repo can never wedge the surface.
 */
export const runGit = (cwd: string, args: readonly string[], timeoutMs: number = config.commandTimeoutMs): Effect.Effect<GitResult> =>
	Effect.tryPromise({
		async try(signal): Promise<GitResult> {
			const proc = Bun.spawn({ cmd: ["git", ...args], cwd, env: gitEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe" })
			const kill = () => proc.kill("SIGKILL")
			signal.addEventListener("abort", kill, { once: true })
			try {
				const [exitCode, stdout, stderr] = await Promise.all([proc.exited, readStream(proc.stdout), readStream(proc.stderr)])
				return { ok: exitCode === 0, stdout, stderr, exitCode, timedOut: false }
			} catch (cause) {
				proc.kill("SIGKILL")
				throw cause
			} finally {
				signal.removeEventListener("abort", kill)
			}
		},
		catch: (cause) => errorMessage(cause) || `Failed to run git ${args[0] ?? ""}`.trim(),
	}).pipe(
		Effect.timeoutOrElse({
			duration: `${timeoutMs} millis`,
			orElse: () => Effect.succeed(gitFailure(`git ${args[0] ?? ""} timed out after ${timeoutMs}ms`.trim(), true)),
		}),
		Effect.catch((detail: string) => Effect.succeed(gitFailure(detail, false))),
	)

/** First non-empty line of git's complaint — enough to identify the problem, short enough for one row of TUI. */
export const gitErrorDetail = (result: GitResult): string => {
	const line =
		result.stderr
			.split("\n")
			.map((entry) => entry.trim())
			.find((entry) => entry.length > 0) ?? ""
	return line.length > 0 ? line.replace(/^fatal:\s*/, "") : `git exited with code ${result.exitCode}`
}

// === `git status --porcelain=v2 --branch --show-stash` ===

/** The one call that answers branch, upstream, ahead/behind, stash depth and dirtiness. */
export const STATUS_ARGS = ["status", "--porcelain=v2", "--branch", "--show-stash"] as const

/** Same question, minus the stash depth — for a git too old to know `--show-stash`. */
export const STATUS_ARGS_WITHOUT_STASH = ["status", "--porcelain=v2", "--branch"] as const

/** True when git rejected the argv itself rather than the repository. */
export const isUnknownOptionFailure = (result: GitResult): boolean => /unknown option|unknown switch|usage: git status/i.test(result.stderr)

export interface GitStatus {
	readonly branch: string | null
	readonly detached: boolean
	readonly upstream: string | null
	readonly ahead: number
	readonly behind: number
	/** Entry-line count, identical to what `git status --porcelain` would print. */
	readonly dirtyCount: number
	readonly stashCount: number
	/** False for a repo whose HEAD is unborn (`# branch.oid (initial)`). */
	readonly hasCommits: boolean
}

export const emptyGitStatus: GitStatus = {
	branch: null,
	detached: false,
	upstream: null,
	ahead: 0,
	behind: 0,
	dirtyCount: 0,
	stashCount: 0,
	hasCommits: false,
}

const after = (line: string, prefix: string) => line.slice(prefix.length).trim()

const parseAheadBehind = (value: string): { readonly ahead: number; readonly behind: number } => {
	// "+3 -2"
	let ahead = 0
	let behind = 0
	for (const token of value.trim().split(/\s+/)) {
		const count = Number.parseInt(token.slice(1), 10)
		if (!Number.isFinite(count)) continue
		if (token.startsWith("+")) ahead = Math.abs(count)
		else if (token.startsWith("-")) behind = Math.abs(count)
	}
	return { ahead, behind }
}

/**
 * The whole reason the scanner uses porcelain v2: branch, detached-ness,
 * upstream, ahead/behind, stash depth and every dirty entry arrive in ONE
 * invocation. Entry lines are `1` (ordinary), `2` (renamed/copied), `u`
 * (unmerged) and `?` (untracked) — counting them reproduces the porcelain-v1
 * line count that `RepoSnapshot.dirtyCount` is specified against.
 */
export const parseStatusPorcelainV2 = (stdout: string): GitStatus => {
	let branch: string | null = null
	let detached = false
	let upstream: string | null = null
	let ahead = 0
	let behind = 0
	let dirtyCount = 0
	let stashCount = 0
	let hasCommits = true

	for (const line of stdout.split("\n")) {
		if (line.length === 0) continue
		if (line.startsWith("# branch.oid ")) {
			hasCommits = after(line, "# branch.oid ") !== "(initial)"
			continue
		}
		if (line.startsWith("# branch.head ")) {
			const head = after(line, "# branch.head ")
			if (head === "(detached)") detached = true
			else if (head.length > 0) branch = head
			continue
		}
		if (line.startsWith("# branch.upstream ")) {
			const value = after(line, "# branch.upstream ")
			if (value.length > 0) upstream = value
			continue
		}
		if (line.startsWith("# branch.ab ")) {
			const counts = parseAheadBehind(after(line, "# branch.ab "))
			ahead = counts.ahead
			behind = counts.behind
			continue
		}
		if (line.startsWith("# stash ")) {
			const count = Number.parseInt(after(line, "# stash "), 10)
			if (Number.isFinite(count) && count > 0) stashCount = count
			continue
		}
		// Unknown headers (older/newer git) are ignored rather than miscounted.
		if (line.startsWith("# ")) continue
		if (line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("u ") || line.startsWith("? ")) dirtyCount += 1
	}

	return { branch, detached, upstream, ahead, behind, dirtyCount, stashCount, hasCommits }
}

// === `git log -1` ===

/**
 * Committer date (ISO strict) and git's own pre-rendered relative age,
 * separated by US (0x1f).
 *
 * Committer date, not author date. The question staleness asks is "when was
 * this repository last touched", and a rebase, amend or cherry-pick moves the
 * committer date while leaving the author date at the original writing. Reading
 * %aI reports a branch someone rebased this morning as months old — the skew is
 * unbounded and grows with exactly the long-lived-branch workflow that makes a
 * staleness check worth having.
 */
export const LAST_COMMIT_FORMAT = "%cI%x1f%cr"

export interface GitLastCommit {
	readonly at: Date | null
	readonly relative: string | null
}

export const noLastCommit: GitLastCommit = { at: null, relative: null }

export const parseLastCommit = (stdout: string): GitLastCommit => {
	const [rawDate = "", rawRelative = ""] = stdout.split("\n")[0]?.split("\x1f") ?? []
	const parsed = new Date(rawDate.trim())
	const relative = rawRelative.trim()
	return {
		at: rawDate.trim().length > 0 && !Number.isNaN(parsed.getTime()) ? parsed : null,
		relative: relative.length > 0 ? relative : null,
	}
}

// === `git worktree list --porcelain` ===

const EMPTY_SHA = "0000000000000000000000000000000000000000"

interface MutableWorktree {
	path: string
	branch: string | null
	headSha: string | null
	isBare: boolean
	isDetached: boolean
	isLocked: boolean
	lockReason: string | null
	isPrunable: boolean
	prunableReason: string | null
}

const freshWorktree = (path: string): MutableWorktree => ({
	path,
	branch: null,
	headSha: null,
	isBare: false,
	isDetached: false,
	isLocked: false,
	lockReason: null,
	isPrunable: false,
	prunableReason: null,
})

/**
 * `prunable`/`locked` are taken verbatim from git rather than re-derived, so the
 * staleWorktrees check never disagrees with `git worktree prune`.
 * `directoryExists` is injectable purely so the parser stays testable.
 */
export const parseWorktreeList = (stdout: string, directoryExists: (path: string) => boolean = existsSync): readonly Worktree[] => {
	const worktrees: Worktree[] = []
	let current: MutableWorktree | null = null

	const flush = () => {
		if (current === null) return
		const entry = current
		current = null
		worktrees.push({
			path: entry.path,
			branch: entry.branch,
			headSha: entry.headSha,
			// git always lists the main worktree first.
			isMain: worktrees.length === 0,
			isBare: entry.isBare,
			isDetached: entry.isDetached,
			isLocked: entry.isLocked,
			lockReason: entry.lockReason,
			isPrunable: entry.isPrunable,
			prunableReason: entry.prunableReason,
			isMissing: !directoryExists(entry.path),
		})
	}

	for (const line of stdout.split("\n")) {
		if (line.trim().length === 0) {
			flush()
			continue
		}
		if (line.startsWith("worktree ")) {
			flush()
			current = freshWorktree(after(line, "worktree "))
			continue
		}
		if (current === null) continue
		if (line.startsWith("HEAD ")) {
			const sha = after(line, "HEAD ")
			current.headSha = sha.length > 0 && sha !== EMPTY_SHA ? sha : null
		} else if (line.startsWith("branch ")) {
			current.branch = after(line, "branch ").replace(/^refs\/heads\//, "")
		} else if (line === "bare") {
			current.isBare = true
		} else if (line === "detached") {
			current.isDetached = true
		} else if (line === "locked") {
			current.isLocked = true
		} else if (line.startsWith("locked ")) {
			current.isLocked = true
			current.lockReason = after(line, "locked ") || null
		} else if (line === "prunable") {
			current.isPrunable = true
		} else if (line.startsWith("prunable ")) {
			current.isPrunable = true
			current.prunableReason = after(line, "prunable ") || null
		}
	}
	flush()

	return worktrees
}

// === `git config --get-regexp ^remote\..*\.url$` ===

export interface GitRemote {
	readonly name: string
	readonly url: string
}

export interface SelectedRemote {
	/** Normalized "owner/repo", or null when no remote points at github.com. */
	readonly remote: string | null
	/** The raw URL of the remote we chose, exactly as configured. */
	readonly remoteUrl: string | null
	/**
	 * EVERY distinct "owner/repo" this clone has a remote for, preferred first
	 * (`remotes[0] === remote`). A fork clone has both its own repository and the
	 * parent here, which is what lets a PR lookup find a cross-fork pull request
	 * whose base lives in the parent rather than in `origin`.
	 */
	readonly remotes: readonly string[]
}

export const noRemote: SelectedRemote = { remote: null, remoteUrl: null, remotes: [] }

const REMOTE_URL_PATTERN = /^remote\.(.+)\.url\s+(.+)$/

export const parseRemoteUrls = (stdout: string): readonly GitRemote[] => {
	const remotes: GitRemote[] = []
	for (const line of stdout.split("\n")) {
		const match = line.trim().match(REMOTE_URL_PATTERN)
		if (!match) continue
		const name = match[1]
		const url = match[2]
		if (!name || !url) continue
		remotes.push({ name, url: url.trim() })
	}
	return remotes
}

const remoteRank = (name: string) => (name === "origin" ? 0 : name === "upstream" ? 1 : 2)

/**
 * Same preference order as `detectCurrentGitHubRepository` (origin, then
 * upstream, then whatever else). The first remote that parses as a GitHub URL
 * wins; if none do we still report the preferred remote's raw URL so the UI can
 * show "not on GitHub" rather than "no remote".
 */
export const selectRemote = (remotes: readonly GitRemote[]): SelectedRemote => {
	if (remotes.length === 0) return noRemote
	const ordered = [...remotes].sort((left, right) => remoteRank(left.name) - remoteRank(right.name))
	const repositories: string[] = []
	let chosen: GitRemote | null = null
	for (const candidate of ordered) {
		const repository = parseGitRemoteUrl(candidate.url)
		if (repository === null || repositories.includes(repository)) continue
		repositories.push(repository)
		chosen ??= candidate
	}
	if (chosen === null) return { remote: null, remoteUrl: ordered[0]?.url ?? null, remotes: [] }
	return { remote: repositories[0] ?? null, remoteUrl: chosen.url, remotes: repositories }
}
