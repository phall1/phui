// === Projects scanner: local git facts for every directory under the roots ===
//
// This is the ONLY component of the Projects feature that performs IO against
// the user's disk. It walks the configured roots, decides which directories are
// projects, and turns each one into a `RepoSnapshot`. Checks downstream are
// pure and synchronous precisely because everything they could need is gathered
// here, once.
//
// PRIVACY: nothing in this file knows or guesses a path. Roots, excludes and
// depth all arrive in the `ProjectsConfig` argument, which the caller resolves
// from the user's env / projects.toml. With no roots configured the scan is a
// no-op that returns an empty result — never a default directory.
//
// === INVOCATION BUDGET ===
//
// Per repository, FOUR `git` processes, run sequentially so a scan of N repos
// never has more than `concurrency` processes alive at once:
//
//   1. git status --porcelain=v2 --branch --show-stash
//        branch, detached-ness, upstream ref, ahead/behind, stash depth AND the
//        dirty-entry count, all from one call. This single flag combination is
//        what replaces the naive four (`rev-parse --abbrev-ref`, `rev-list
//        --left-right --count`, `status --porcelain`, `stash list`).
//   2. git log -1 --format=%cI%x1f%cr        last commit instant + relative age
//   3. git worktree list --porcelain         worktrees, with git's own
//                                            locked/prunable verdicts
//   4. git config --get-regexp ^remote\..*\.url$   all remote URLs at once,
//                                            so no second call is needed when
//                                            `origin` is missing
//
// Zero processes are spawned for a directory that is not a repository (the
// `.git` probe is a `stat`, not a `git rev-parse`), and steps 2-4 are skipped
// when step 1 already told us the repo is unreadable. A repo with no commits,
// no upstream, no remote or a detached HEAD costs the same four calls and
// produces a snapshot with nulls rather than an error.

import { readdir, realpath, stat } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { basename, join, sep } from "node:path"
import { Effect } from "effect"
import { config as appConfig } from "../config.js"
import { errorMessage } from "../errors.js"
import { resolveProjectIntent, type ProjectsConfig } from "./config.js"
import {
	emptyGitStatus,
	gitErrorDetail,
	isUnknownOptionFailure,
	LAST_COMMIT_FORMAT,
	noLastCommit,
	noRemote,
	parseLastCommit,
	parseRemoteUrls,
	parseStatusPorcelainV2,
	parseWorktreeList,
	runGit,
	selectRemote,
	STATUS_ARGS,
	STATUS_ARGS_WITHOUT_STASH,
} from "./git.js"
import { nonRepoSnapshot, projectSnapshot, type ProjectSnapshot, type RepoSnapshot } from "./types.js"

// === Options ===

export interface ScanOptions {
	/** How many repositories to inspect at once. Bounded so a big roots list cannot fork-bomb the TUI. */
	readonly concurrency?: number
	/** Per-git-call timeout. Defaults to the app-wide `PHUI_COMMAND_TIMEOUT_MS`. */
	readonly timeoutMs?: number
	/** Safety valve against a mis-typed root (`/`, `~`): stop after this many projects and warn. */
	readonly maxProjects?: number
	/** Injected for deterministic tests. */
	readonly scannedAt?: Date
}

const DEFAULT_CONCURRENCY = 8
const MAX_CONCURRENCY = 32
const DEFAULT_MAX_PROJECTS = 500

interface ResolvedScanOptions {
	readonly concurrency: number
	readonly timeoutMs: number
	readonly maxProjects: number
	readonly scannedAt: Date
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(value)))

const resolveScanOptions = (options: ScanOptions | undefined): ResolvedScanOptions => ({
	concurrency: options?.concurrency !== undefined && Number.isFinite(options.concurrency) ? clamp(options.concurrency, 1, MAX_CONCURRENCY) : DEFAULT_CONCURRENCY,
	timeoutMs: options?.timeoutMs !== undefined && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? Math.floor(options.timeoutMs) : appConfig.commandTimeoutMs,
	maxProjects: options?.maxProjects !== undefined && Number.isFinite(options.maxProjects) && options.maxProjects > 0 ? Math.floor(options.maxProjects) : DEFAULT_MAX_PROJECTS,
	scannedAt: options?.scannedAt ?? new Date(),
})

// === Discovery ===

export type ProjectDirectoryKind = "repository" | "bareRepository" | "directory"

/** A directory the walk decided is a project candidate, before any git call. */
export interface ProjectDirectory {
	readonly path: string
	readonly name: string
	readonly scanRoot: string
	readonly kind: ProjectDirectoryKind
	/** Set when the directory could not be inspected at all (EACCES). Becomes `RepoSnapshot.scanError`. */
	readonly error?: string | null
}

export interface ProjectDiscovery {
	readonly directories: readonly ProjectDirectory[]
	readonly warnings: readonly string[]
}

/**
 * Directories that are never projects and would be catastrophic to descend into
 * at maxDepth > 1. Dot-directories are skipped separately (see `collectEntries`)
 * — a scan root full of caches is the common case, and `.git` itself must never
 * be walked. Users add their own via `exclude` in projects.toml.
 */
const ALWAYS_EXCLUDED = new Set(["node_modules", "bower_components", "__pycache__", "Library"])

const globToRegExp = (pattern: string): RegExp =>
	new RegExp(
		`^${pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			.replace(/\*/g, ".*")
			.replace(/\?/g, ".")}$`,
	)

/** `exclude` entries match a directory's basename or its absolute path, with `*` / `?` globbing. */
const compileExcludes = (patterns: readonly string[]): readonly RegExp[] =>
	patterns
		.map((pattern) => pattern.trim().replace(/\/+$/, ""))
		.filter((pattern) => pattern.length > 0)
		.map(globToRegExp)

const isExcluded = (name: string, path: string, patterns: readonly RegExp[]) => ALWAYS_EXCLUDED.has(name) || patterns.some((pattern) => pattern.test(name) || pattern.test(path))

const pathExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

const ABSENT_CODES = new Set(["ENOENT", "ENOTDIR"])

const isAbsent = (cause: unknown): boolean =>
	typeof cause === "object" && cause !== null && "code" in cause && ABSENT_CODES.has(String((cause as { readonly code?: unknown }).code))

export interface DirectoryProbe {
	readonly kind: ProjectDirectoryKind
	readonly error: string | null
}

/**
 * A `stat` rather than a `git rev-parse`: no process, and it cannot mistake a
 * plain subdirectory of some outer repository for a project of its own. `.git`
 * is a file (not a directory) for linked worktrees and submodules, so `stat`
 * covers both; a bare repo has no `.git` at all and is detected by its layout.
 *
 * A stat error that is not "absent" (EACCES on a mode-000 directory, EIO on a
 * dead network mount) is reported as `error` instead of being silently rounded
 * down to "not a repository" — otherwise an unreadable directory would show up
 * as a confident `notARepo` finding.
 */
const probeDirectory = async (path: string): Promise<DirectoryProbe> => {
	try {
		await stat(join(path, ".git"))
		return { kind: "repository", error: null }
	} catch (cause) {
		if (!isAbsent(cause)) return { kind: "directory", error: errorMessage(cause) }
	}
	if ((await pathExists(join(path, "HEAD"))) && (await pathExists(join(path, "objects")))) return { kind: "bareRepository", error: null }
	return { kind: "directory", error: null }
}

const realPathOr = async (path: string): Promise<string> => {
	try {
		return await realpath(path)
	} catch {
		return path
	}
}

const isDirectoryEntry = async (entry: Dirent, path: string): Promise<boolean> => {
	if (entry.isDirectory()) return true
	// Symlinked project directories are common (dotfile-managed checkouts); follow
	// them, but `visited` below keeps a symlink cycle from looping forever.
	if (!entry.isSymbolicLink()) return false
	try {
		return (await stat(path)).isDirectory()
	} catch {
		return false
	}
}

interface WalkState {
	readonly candidates: Map<string, ProjectDirectory>
	readonly warnings: string[]
	/** Real paths already considered — dedupes overlapping roots and breaks symlink cycles. */
	readonly visited: Set<string>
	truncated: boolean
}

interface WalkContext {
	readonly maxDepth: number
	readonly maxProjects: number
	readonly excludes: readonly RegExp[]
	/**
	 * Every configured root, as given and realpath-resolved. A root is a
	 * CONTAINER the user chose, so it is never itself reported as a stray
	 * directory when an outer root's walk happens to step over it.
	 */
	readonly configuredRoots: ReadonlySet<string>
}

const addCandidate = (state: WalkState, candidate: ProjectDirectory) => {
	if (state.candidates.has(candidate.path)) return
	state.candidates.set(candidate.path, candidate)
}

/**
 * Returns how many candidates were recorded at or below `dir`. The count is
 * what lets a container directory stay silent: a folder that merely holds
 * repositories is not itself reported as "not a repo", while a top-level entry
 * that holds nothing is.
 *
 * Non-repository directories are only ever recorded at depth 1. "A directory
 * sitting directly in your scan root is not a repository" is a real finding;
 * "some sub-sub-folder of a project is not a repository" is noise.
 */
const collectEntries = async (dir: string, depth: number, scanRoot: string, context: WalkContext, state: WalkState): Promise<number> => {
	if (state.candidates.size >= context.maxProjects) {
		state.truncated = true
		return 0
	}

	let entries: readonly Dirent[]
	try {
		entries = await readdir(dir, { withFileTypes: true })
	} catch (cause) {
		// EACCES / EPERM / ENOENT mid-scan: warn and keep going. Never throw.
		state.warnings.push(`Could not read ${dir}: ${errorMessage(cause)}`)
		return 0
	}

	// Real directories are visited before symlinks so that a symlink pointing at
	// a sibling loses the `visited` race and the project keeps its true name.
	// Sorting by name on top of that makes a scan deterministic regardless of
	// filesystem ordering.
	const sorted = [...entries].sort((left, right) => Number(left.isSymbolicLink()) - Number(right.isSymbolicLink()) || left.name.localeCompare(right.name))
	let added = 0

	for (const entry of sorted) {
		if (state.candidates.size >= context.maxProjects) {
			state.truncated = true
			break
		}
		const name = entry.name
		if (name.startsWith(".")) continue
		const path = join(dir, name)
		if (isExcluded(name, path, context.excludes)) continue
		if (!(await isDirectoryEntry(entry, path))) continue

		const real = await realPathOr(path)
		if (state.visited.has(real)) continue
		state.visited.add(real)

		const probe = await probeDirectory(path)
		if (probe.kind !== "directory") {
			// A repository is a leaf: never descend into one looking for more.
			addCandidate(state, { path, name, scanRoot, kind: probe.kind, error: probe.error })
			added += 1
			continue
		}
		if (probe.error === null && depth < context.maxDepth) {
			const nested = await collectEntries(path, depth + 1, scanRoot, context, state)
			if (nested > 0) {
				added += nested
				continue
			}
		}
		if (depth > 1) continue
		// A directory the user configured as a root of its own is a container,
		// not a stray: its own `collectRoot` pass has already scanned it.
		if (context.configuredRoots.has(path) || context.configuredRoots.has(real)) continue
		addCandidate(state, { path, name, scanRoot, kind: probe.kind, error: probe.error })
		added += 1
	}

	return added
}

const collectRoot = async (root: string, context: WalkContext, state: WalkState): Promise<void> => {
	let info
	try {
		info = await stat(root)
	} catch (cause) {
		state.warnings.push(`Scan root ${root} could not be read: ${errorMessage(cause)}`)
		return
	}
	if (!info.isDirectory()) {
		state.warnings.push(`Scan root ${root} is not a directory.`)
		return
	}

	const real = await realPathOr(root)
	if (state.visited.has(real)) return
	state.visited.add(real)

	// A root that is itself a repository is a single project, not a container.
	const probe = await probeDirectory(root)
	if (probe.kind !== "directory") {
		addCandidate(state, { path: root, name: basename(root) || root, scanRoot: root, kind: probe.kind, error: probe.error })
		return
	}

	await collectEntries(root, 1, root, context, state)
}

/**
 * Walk the configured roots. Pure with respect to configuration (everything
 * comes from the argument) and total: unreadable roots, permission errors,
 * symlink cycles and missing directories all become warnings, never failures.
 */
export const discoverProjectDirectories = (config: ProjectsConfig, options?: ScanOptions): Effect.Effect<ProjectDiscovery> => {
	const resolved = resolveScanOptions(options)
	return Effect.promise(async (): Promise<ProjectDiscovery> => {
		const state: WalkState = { candidates: new Map(), warnings: [], visited: new Set(), truncated: false }
		const configuredRoots = new Set(config.roots)
		for (const root of config.roots) configuredRoots.add(await realPathOr(root))
		const context: WalkContext = {
			maxDepth: Math.max(1, config.maxDepth),
			maxProjects: resolved.maxProjects,
			excludes: compileExcludes(config.exclude),
			configuredRoots,
		}
		// Deepest root first. `visited` dedupes overlapping roots on a first-come
		// basis, so with `roots = ["/base", "/base/experiments"]` in the order the
		// user happened to write them, the outer walk would claim
		// `/base/experiments` and the inner root would then return immediately —
		// its projects never scanned. Walking the nested root first makes the
		// result independent of the order the roots were listed in.
		const ordered = [...config.roots].sort((left, right) => right.split(sep).length - left.split(sep).length || left.localeCompare(right))
		for (const root of ordered) {
			await collectRoot(root, context, state)
		}
		if (state.truncated) {
			state.warnings.push(`Stopped after ${resolved.maxProjects} projects. Narrow "roots" or lower "maxDepth" in your projects.toml.`)
		}
		return { directories: [...state.candidates.values()], warnings: state.warnings }
	})
}

// === Per-repository git facts ===

/** A repository we could not inspect: identified, but with every fact unknown. */
const degradedRepoSnapshot = (directory: ProjectDirectory, scanError: string): RepoSnapshot => ({
	...nonRepoSnapshot(directory.path, directory.name, directory.scanRoot, scanError),
	isGitRepo: true,
})

/**
 * The four-call budget documented at the top of this file, for exactly one
 * directory. Never fails: every git call is total, and a failure of the first
 * call short-circuits the rest into a snapshot carrying `scanError`.
 */
export const inspectProjectDirectory = (directory: ProjectDirectory, options?: ScanOptions): Effect.Effect<RepoSnapshot> => {
	const resolved = resolveScanOptions(options)
	return Effect.gen(function* () {
		if (directory.kind === "directory") return nonRepoSnapshot(directory.path, directory.name, directory.scanRoot, directory.error ?? null)
		if (directory.error !== undefined && directory.error !== null) return degradedRepoSnapshot(directory, directory.error)

		const bare = directory.kind === "bareRepository"

		// 1/4 — status. Skipped for a bare repo, which has no work tree to report
		// on; `git status` there fails with a message that is not a real problem.
		let status = emptyGitStatus
		if (!bare) {
			let result = yield* runGit(directory.path, STATUS_ARGS, resolved.timeoutMs)
			// `--show-stash` predates the `# stash` porcelain-v2 header, but a git
			// old enough to reject the flag outright must still yield a snapshot —
			// retry without it and simply report no stashes.
			if (!result.ok && isUnknownOptionFailure(result)) result = yield* runGit(directory.path, STATUS_ARGS_WITHOUT_STASH, resolved.timeoutMs)
			if (!result.ok) return degradedRepoSnapshot(directory, gitErrorDetail(result))
			status = parseStatusPorcelainV2(result.stdout)
		}

		// 2/4 — last commit. Exits 128 on an unborn HEAD; that is a legal state
		// for a fresh repo, so it degrades to nulls rather than a scanError.
		const logResult = yield* runGit(directory.path, ["log", "-1", `--format=${LAST_COMMIT_FORMAT}`], resolved.timeoutMs)
		const lastCommit = logResult.ok ? parseLastCommit(logResult.stdout) : noLastCommit

		// 3/4 — worktrees, including git's locked/prunable verdicts.
		const worktreeResult = yield* runGit(directory.path, ["worktree", "list", "--porcelain"], resolved.timeoutMs)
		const worktrees = worktreeResult.ok ? parseWorktreeList(worktreeResult.stdout) : []

		// 4/4 — every remote URL in one call; exits 1 when the repo has none.
		const remoteResult = yield* runGit(directory.path, ["config", "--get-regexp", "^remote\\..*\\.url$"], resolved.timeoutMs)
		const remote = remoteResult.ok ? selectRemote(parseRemoteUrls(remoteResult.stdout)) : noRemote

		return {
			path: directory.path,
			name: directory.name,
			scanRoot: directory.scanRoot,
			isGitRepo: true,
			currentBranch: status.branch,
			detachedHead: status.detached,
			dirtyCount: status.dirtyCount,
			ahead: status.ahead,
			behind: status.behind,
			upstreamRef: status.upstream,
			lastCommitAt: lastCommit.at,
			lastCommitRelative: lastCommit.relative,
			remote: remote.remote,
			githubRemotes: remote.remotes,
			remoteUrl: remote.remoteUrl,
			worktrees,
			stashCount: status.stashCount,
			scanError: null,
		}
	})
}

/** Inspect a single directory by path — the convenient entry point for tests and for a targeted rescan. */
export const scanRepository = (path: string, scanRoot: string = path, options?: ScanOptions): Effect.Effect<RepoSnapshot> =>
	Effect.gen(function* () {
		const probe = yield* Effect.promise(() => probeDirectory(path))
		return yield* inspectProjectDirectory({ path, name: basename(path) || path, scanRoot, kind: probe.kind, error: probe.error }, options)
	})

// === Entry point ===

export interface ProjectsScan {
	/** One entry per discovered directory, in scan order. `github` is always absent — this scanner is local-only. */
	readonly projects: readonly ProjectSnapshot[]
	/** Unreadable roots, permission errors, truncation. Merge into `ProjectsReport.warnings`. */
	readonly warnings: readonly string[]
	readonly scannedAt: Date
}

const emptyScan = (scannedAt: Date): ProjectsScan => ({ projects: [], warnings: [], scannedAt })

/**
 * Scan every configured root and return one `ProjectSnapshot` per project,
 * with `intent` already resolved from the config and `github` left absent for
 * the remote-fetch layer to fill in.
 *
 * Takes its configuration as an argument and reads none of its own, so a test
 * can drive it against a temp fixture directory with a hand-built config.
 * Never fails: `Effect<ProjectsScan>` has `never` in both the error and the
 * requirement channels.
 */
export const scanProjects = (config: ProjectsConfig, options?: ScanOptions): Effect.Effect<ProjectsScan> => {
	const resolved = resolveScanOptions(options)
	return Effect.gen(function* () {
		if (config.roots.length === 0) return emptyScan(resolved.scannedAt)

		const discovery = yield* discoverProjectDirectories(config, options)
		if (discovery.directories.length === 0) return { projects: [], warnings: discovery.warnings, scannedAt: resolved.scannedAt }

		// Bounded concurrency: at most `resolved.concurrency` git processes are
		// alive at any moment, no matter how many repositories were discovered.
		const snapshots = yield* Effect.forEach(discovery.directories, (directory) => inspectProjectDirectory(directory, { ...options, timeoutMs: resolved.timeoutMs }), {
			concurrency: resolved.concurrency,
		})

		return {
			projects: snapshots.map((repo) => projectSnapshot(repo, null, resolveProjectIntent(config, repo))),
			warnings: discovery.warnings,
			scannedAt: resolved.scannedAt,
		}
	})
}

/** `scanProjects` without the envelope, for callers that only want the snapshots. */
export const scanProjectSnapshots = (config: ProjectsConfig, options?: ScanOptions): Effect.Effect<readonly ProjectSnapshot[]> =>
	scanProjects(config, options).pipe(Effect.map((scan) => scan.projects))
