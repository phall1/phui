import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { CacheService } from "../services/CacheService.js"
import { GitHubService } from "../services/GitHubService.js"
import { githubRuntime } from "../services/runtime.js"
import { runCheckIds, runChecks } from "./checks/index.js"
import { checkContext, hasConfiguredRoots, loadProjectsConfig, type ProjectsConfig } from "./config.js"
import { fetchProjectGitHubSnapshots } from "./github.js"
import { scanProjects } from "./scan.js"
import { emptyProjectsReport, projectSnapshot, type ProjectsReport } from "./types.js"

// === UI state ===

// Cursor into the currently rendered selectable rows (findings, or projects
// when the inventory is shown). Kept alive so switching tabs and coming back
// does not silently reset the user's place.
export const projectsSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)

// `a` flips the body from "findings" to "every project we scanned". The
// findings view is the default because this surface is a linter.
export const projectsInventoryAtom = Atom.make(false).pipe(Atom.keepAlive)

// Bumped by `r`. Read inside `projectsReportAtom`, so bumping it re-runs the
// scan. The rescan ACTION clears the GitHub memo first (see ProjectsView), which
// is what makes a manual rescan refetch instead of handing back a ten-minute-old
// CI verdict — a `force` flag derived from this counter would instead latch on
// after the first rescan and disable the memo for the rest of the session.
export const projectsRescanAtom = Atom.make(0).pipe(Atom.keepAlive)

// === Report ===

export interface ProjectsSurfaceState {
	readonly config: ProjectsConfig
	readonly report: ProjectsReport
}

/**
 * The whole surface in one atom: config → scan → GitHub → checks.
 *
 * Every stage is `E = never` by contract (a broken config, an unreadable root,
 * a missing `gh` all degrade to warnings), so this atom only ever resolves to
 * a value — `warnings` is the channel through which partial failure reaches the
 * user, which is why the view renders it instead of dropping it.
 *
 * `keepAlive` because a scan spawns git processes per repository; the result
 * should survive a tab switch and refresh only when the user asks.
 */
export const projectsReportAtom = githubRuntime
	.atom(
		Effect.fnUntraced(function* (get) {
			// Read purely to subscribe: bumping this is what re-runs the scan.
			get(projectsRescanAtom)
			const scannedAt = new Date()
			const config = yield* loadProjectsConfig
			if (!hasConfiguredRoots(config)) return { config, report: emptyProjectsReport(scannedAt, config.warnings) } satisfies ProjectsSurfaceState

			const scan = yield* scanProjects(config, { scannedAt })
			const github = yield* GitHubService
			const cache = yield* CacheService
			const remote = yield* fetchProjectGitHubSnapshots(
				scan.projects.map((project) => project.repo),
				{ github, cache },
				{ now: scannedAt },
			)

			// `github` is the preferred remote's facts; `relatedGitHub` carries the
			// rest (a fork's `upstream`), which is where a cross-fork PR's base — and
			// therefore the PR itself — actually lives.
			const projects = scan.projects.map((project) => {
				const primary = project.repo.remote === null ? null : (remote.snapshots.get(project.repo.remote) ?? null)
				const related = project.repo.githubRemotes
					.filter((name) => name !== project.repo.remote)
					.flatMap((name) => {
						const snapshot = remote.snapshots.get(name)
						return snapshot === undefined ? [] : [snapshot]
					})
				return projectSnapshot(project.repo, primary, project.intent ?? null, related)
			})
			const report: ProjectsReport = {
				findings: runChecks(projects, checkContext(config, scannedAt)),
				projects,
				ranCheckIds: runCheckIds(projects),
				warnings: [...config.warnings, ...scan.warnings, ...remote.warnings],
				scannedAt: scan.scannedAt,
			}
			return { config, report } satisfies ProjectsSurfaceState
		}),
	)
	.pipe(Atom.keepAlive)
