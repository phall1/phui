import { describe, expect, test } from "bun:test"
import { hasGitHubData, projectChecks, runCheckIds, runChecks } from "../../src/projects/checks/index.ts"
import { aheadNoPrCheck } from "../../src/projects/checks/aheadNoPr.ts"
import { ciRedCheck } from "../../src/projects/checks/ciRed.ts"
import { dirtyAndStaleCheck } from "../../src/projects/checks/dirtyAndStale.ts"
import { dupRemotesCheck } from "../../src/projects/checks/dupRemotes.ts"
import { notARepoCheck } from "../../src/projects/checks/notARepo.ts"
import { staleWorktreesCheck } from "../../src/projects/checks/staleWorktrees.ts"
import {
	isMoreSevere,
	nonRepoSnapshot,
	projectIntent,
	projectSnapshot,
	type CheckContext,
	type GitHubSnapshot,
	type ProjectPullRequest,
	type ProjectSnapshot,
	type RepoSnapshot,
	type Worktree,
} from "../../src/projects/types.ts"

// Fixtures are plain data and every path here is invented — no real scan root,
// project name or intent text belongs in this repo.

const NOW = new Date("2026-01-15T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000
const ROOT = "/roots/code"

const ctx: CheckContext = { now: NOW, staleDays: 14, configPath: "/config/ghui/projects.toml" }

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS)

const repo = (name: string, overrides: Partial<RepoSnapshot> = {}): RepoSnapshot => ({
	...nonRepoSnapshot(`${ROOT}/${name}`, name, ROOT),
	isGitRepo: true,
	currentBranch: "main",
	lastCommitAt: daysAgo(1),
	...overrides,
})

const github = (overrides: Partial<GitHubSnapshot> = {}): GitHubSnapshot => ({
	repository: "owner/repo",
	defaultBranch: "main",
	openPullRequests: [],
	pullRequestsTruncated: false,
	latestRunConclusion: null,
	latestRunUrl: null,
	latestRunAt: null,
	latestRelease: null,
	fetchedAt: NOW,
	...overrides,
})

const pullRequest = (headRefName: string): ProjectPullRequest => ({
	number: 7,
	headRefName,
	title: "A change",
	url: "https://example.invalid/owner/repo/pull/7",
	isDraft: false,
	updatedAt: NOW,
})

const worktree = (path: string, overrides: Partial<Worktree> = {}): Worktree => ({
	path,
	branch: null,
	headSha: null,
	isMain: false,
	isBare: false,
	isDetached: false,
	isLocked: false,
	lockReason: null,
	isPrunable: false,
	prunableReason: null,
	isMissing: false,
	...overrides,
})

const ids = (snapshots: readonly ProjectSnapshot[], check: (typeof projectChecks)[number]) => check.run(snapshots, ctx).map((finding) => finding.projectName)

describe("severity mapping", () => {
	// Pinned deliberately: the checks were specced as "major"/"minor" and this is
	// the only place that vocabulary meets the three-value Finding contract.
	test("major checks emit error, minor checks emit warning", () => {
		expect(dirtyAndStaleCheck.defaultSeverity).toBe("error")
		expect(aheadNoPrCheck.defaultSeverity).toBe("error")
		expect(ciRedCheck.defaultSeverity).toBe("error")
		expect(notARepoCheck.defaultSeverity).toBe("warning")
		expect(staleWorktreesCheck.defaultSeverity).toBe("warning")
	})
})

describe("aheadNoPr", () => {
	const ahead = (overrides: Partial<RepoSnapshot> = {}) => repo("app", { ahead: 2, currentBranch: "feat/x", upstreamRef: "origin/feat/x", ...overrides })

	test("stays silent when GitHub data is absent — no PR data means no claim about PRs", () => {
		const snapshots = [projectSnapshot(ahead())]
		expect(aheadNoPrCheck.run(snapshots, ctx)).toEqual([])
	})

	test("fires when GitHub data is present and no open PR matches the branch", () => {
		const snapshots = [projectSnapshot(ahead(), github({ openPullRequests: [pullRequest("feat/other")] }))]
		const findings = aheadNoPrCheck.run(snapshots, ctx)
		expect(findings).toHaveLength(1)
		expect(findings[0]!.checkId).toBe("aheadNoPr")
		expect(findings[0]!.severity).toBe("error")
		expect(findings[0]!.detail).toBe("2 commits ahead of origin/feat/x on feat/x, with no open pull request")
		expect(findings[0]!.suggestion).toContain("gh pr create")
	})

	test("stays silent when an open PR has the current branch as its head", () => {
		const snapshots = [projectSnapshot(ahead(), github({ openPullRequests: [pullRequest("feat/x")] }))]
		expect(aheadNoPrCheck.run(snapshots, ctx)).toEqual([])
	})

	test("stays silent when nothing is ahead, and when HEAD is detached", () => {
		expect(aheadNoPrCheck.run([projectSnapshot(ahead({ ahead: 0 }), github())], ctx)).toEqual([])
		expect(aheadNoPrCheck.run([projectSnapshot(ahead({ detachedHead: true, currentBranch: null }), github())], ctx)).toEqual([])
	})

	test("on the default branch it reports unpushed commits and suggests a push", () => {
		const snapshots = [projectSnapshot(repo("app", { ahead: 3, currentBranch: "main", upstreamRef: "origin/main" }), github({ defaultBranch: "main" }))]
		const findings = aheadNoPrCheck.run(snapshots, ctx)
		expect(findings).toHaveLength(1)
		expect(findings[0]!.title).toBe("Unpushed commits")
		expect(findings[0]!.suggestion).toContain("git -C /roots/code/app push")
	})

	test("requiresGitHub is declared so the runner can report it as skipped", () => {
		expect(aheadNoPrCheck.requiresGitHub).toBe(true)
	})

	test("stays silent when the open-PR list was truncated", () => {
		expect(aheadNoPrCheck.run([projectSnapshot(ahead(), github({ pullRequestsTruncated: true }))], ctx)).toEqual([])
	})

	test("finds a cross-fork PR in the parent repository's snapshot", () => {
		// origin is the fork, upstream is the parent; the PR's base — and so the PR
		// itself — lives in the parent's pull-request connection only.
		const fork = ahead({ remote: "me/ghui", githubRemotes: ["me/ghui", "them/ghui"] })
		const parent = github({ repository: "them/ghui", openPullRequests: [pullRequest("feat/x")] })
		const snapshots = [projectSnapshot(fork, github({ repository: "me/ghui" }), null, [parent])]
		expect(aheadNoPrCheck.run(snapshots, ctx)).toEqual([])
	})

	test("stays silent when a remote of the clone was never fetched", () => {
		const fork = ahead({ remote: "me/ghui", githubRemotes: ["me/ghui", "them/ghui"] })
		// Only the fork answered: the parent's PRs are unknown, so "no open PR" is
		// not a claim this check is entitled to make.
		expect(aheadNoPrCheck.run([projectSnapshot(fork, github({ repository: "me/ghui" }))], ctx)).toEqual([])
	})

	test("omits --repo when the clone has more than one GitHub remote", () => {
		const fork = ahead({ remote: "me/ghui", githubRemotes: ["me/ghui", "them/ghui"] })
		const snapshots = [projectSnapshot(fork, github({ repository: "me/ghui" }), null, [github({ repository: "them/ghui" })])]
		const findings = aheadNoPrCheck.run(snapshots, ctx)
		expect(findings).toHaveLength(1)
		expect(findings[0]!.suggestion).toBe("Open one: gh pr create --head feat/x")
	})
})

describe("dirtyAndStale", () => {
	const dirty = (days: number) => projectSnapshot(repo("app", { dirtyCount: 3, lastCommitAt: daysAgo(days) }))

	test("does not fire at exactly the stale threshold", () => {
		expect(dirtyAndStaleCheck.run([dirty(14)], ctx)).toEqual([])
	})

	test("fires just past the stale threshold", () => {
		const findings = dirtyAndStaleCheck.run([projectSnapshot(repo("app", { dirtyCount: 3, lastCommitAt: new Date(NOW.getTime() - 14 * DAY_MS - 1) }))], ctx)
		expect(findings).toHaveLength(1)
		expect(findings[0]!.checkId).toBe("dirtyAndStale")
	})

	test("names the file count and how long it has been sitting", () => {
		const findings = dirtyAndStaleCheck.run([dirty(42)], ctx)
		expect(findings[0]!.detail).toBe("3 uncommitted files, sitting untouched for 6 weeks")
		expect(dirtyAndStaleCheck.run([projectSnapshot(repo("app", { dirtyCount: 1, lastCommitAt: daysAgo(20) }))], ctx)[0]!.detail).toBe(
			"1 uncommitted file, sitting untouched for 2 weeks",
		)
	})

	test("needs both halves: a clean stale repo and a dirty fresh repo are both silent", () => {
		expect(dirtyAndStaleCheck.run([projectSnapshot(repo("app", { dirtyCount: 0, lastCommitAt: daysAgo(400) }))], ctx)).toEqual([])
		expect(dirtyAndStaleCheck.run([dirty(1)], ctx)).toEqual([])
	})

	test("honours a different staleDays from the context", () => {
		expect(dirtyAndStaleCheck.run([dirty(20)], { ...ctx, staleDays: 30 })).toEqual([])
		expect(dirtyAndStaleCheck.run([dirty(20)], { ...ctx, staleDays: 7 })).toHaveLength(1)
	})

	test("a repo with no commit at all has no age to measure", () => {
		expect(dirtyAndStaleCheck.run([projectSnapshot(repo("app", { dirtyCount: 5, lastCommitAt: null }))], ctx)).toEqual([])
	})
})

describe("dupRemotes", () => {
	const clone = (name: string, remote: string | null, dirtyCount = 0) => projectSnapshot(repo(name, { remote, dirtyCount }))

	test("groups by remote and reports one finding per duplicated remote", () => {
		const snapshots = [clone("beta", "owner/shared"), clone("alpha", "owner/shared"), clone("solo", "owner/other"), clone("local", null)]
		const findings = dupRemotesCheck.run(snapshots, ctx)
		expect(findings).toHaveLength(1)
		const finding = findings[0]!
		// Anchored on the alphabetically first path, siblings in relatedPaths.
		expect(finding.projectName).toBe("alpha")
		expect(finding.relatedPaths).toEqual([`${ROOT}/beta`])
		expect(finding.detail).toBe("owner/shared is cloned in 2 places (alpha, beta)")
		expect(finding.severity).toBe("warning")
		expect(finding.id).toBe(`dupRemotes:${ROOT}/alpha:owner/shared`)
	})

	test("escalates severity when any of the duplicates is dirty", () => {
		const clean = dupRemotesCheck.run([clone("alpha", "owner/shared"), clone("beta", "owner/shared")], ctx)[0]!
		const dirty = dupRemotesCheck.run([clone("alpha", "owner/shared"), clone("beta", "owner/shared", 4)], ctx)[0]!
		expect(dirty.severity).toBe("error")
		expect(isMoreSevere(dirty.severity, clean.severity)).toBe(true)
		expect(dirty.detail).toContain("1 of them have uncommitted changes")
	})

	test("reports each duplicated remote separately and sorts groups by remote", () => {
		const snapshots = [clone("a", "owner/one"), clone("b", "owner/one"), clone("c", "owner/two"), clone("d", "owner/two")]
		expect(dupRemotesCheck.run(snapshots, ctx).map((finding) => finding.id)).toEqual([`dupRemotes:${ROOT}/a:owner/one`, `dupRemotes:${ROOT}/c:owner/two`])
	})

	test("a project marked dead drops out of its group", () => {
		const snapshots = [clone("alpha", "owner/shared"), projectSnapshot(repo("beta", { remote: "owner/shared" }), null, projectIntent("dead"))]
		expect(dupRemotesCheck.run(snapshots, ctx)).toEqual([])
	})

	// A repo and its linked worktrees share one config, so they report the SAME
	// remote — and each is discovered as a project of its own when it sits under
	// a scan root. Reporting them as clones would tell the user to delete live
	// worktrees, so they collapse onto their common repository before grouping.
	const worktreeSet = (main: string, ...linked: string[]) => [worktree(main, { isMain: true }), ...linked.map((path) => worktree(path))]

	test("linked worktrees of one repo are not duplicate clones", () => {
		const paths = worktreeSet(`${ROOT}/app`, `${ROOT}/app-feat`, `${ROOT}/app-fix`)
		const snapshots = [
			projectSnapshot(repo("app", { remote: "owner/app", worktrees: paths })),
			projectSnapshot(repo("app-feat", { remote: "owner/app", worktrees: paths })),
			projectSnapshot(repo("app-fix", { remote: "owner/app", worktrees: paths })),
		]
		expect(dupRemotesCheck.run(snapshots, ctx)).toEqual([])
	})

	test("a real second clone is still reported, counting each worktree set once", () => {
		const first = worktreeSet(`${ROOT}/app`, `${ROOT}/app-feat`, `${ROOT}/app-fix`)
		const second = worktreeSet(`${ROOT}/app-copy`)
		const snapshots = [
			projectSnapshot(repo("app", { remote: "owner/app", worktrees: first })),
			projectSnapshot(repo("app-feat", { remote: "owner/app", worktrees: first })),
			projectSnapshot(repo("app-fix", { remote: "owner/app", worktrees: first })),
			projectSnapshot(repo("app-copy", { remote: "owner/app", worktrees: second })),
		]
		const findings = dupRemotesCheck.run(snapshots, ctx)
		expect(findings).toHaveLength(1)
		expect(findings[0]!.detail).toBe("owner/app is cloned in 2 places (app, app-copy)")
		expect(findings[0]!.relatedPaths).toEqual([`${ROOT}/app-copy`])
	})

	test("uncommitted work inside a linked worktree still escalates its clone", () => {
		const first = worktreeSet(`${ROOT}/app`, `${ROOT}/app-feat`)
		const second = worktreeSet(`${ROOT}/app-copy`)
		const snapshots = [
			projectSnapshot(repo("app", { remote: "owner/app", worktrees: first })),
			projectSnapshot(repo("app-feat", { remote: "owner/app", worktrees: first, dirtyCount: 3 })),
			projectSnapshot(repo("app-copy", { remote: "owner/app", worktrees: second })),
		]
		const findings = dupRemotesCheck.run(snapshots, ctx)
		expect(findings).toHaveLength(1)
		expect(findings[0]!.severity).toBe("error")
		expect(findings[0]!.detail).toContain("1 of them have uncommitted changes")
	})

	test("macOS /private path divergence does not split one worktree set in two", () => {
		// `git worktree list` prints /private/var/… where the scanner recorded /var/…
		const paths = [worktree("/private/var/w/app", { isMain: true }), worktree("/private/var/w/app-feat")]
		const snapshots = [
			projectSnapshot({ ...repo("app", { remote: "owner/app", worktrees: paths }), path: "/var/w/app" }),
			projectSnapshot({ ...repo("app-feat", { remote: "owner/app", worktrees: paths }), path: "/var/w/app-feat" }),
		]
		expect(dupRemotesCheck.run(snapshots, ctx)).toEqual([])
	})
})

describe("notARepo", () => {
	test("reports plain directories under a root and points at the config file", () => {
		const snapshots = [projectSnapshot(nonRepoSnapshot(`${ROOT}/notes`, "notes", ROOT)), projectSnapshot(repo("app"))]
		const findings = notARepoCheck.run(snapshots, ctx)
		expect(findings).toHaveLength(1)
		expect(findings[0]!.projectName).toBe("notes")
		expect(findings[0]!.severity).toBe("warning")
		expect(findings[0]!.suggestion).toContain("/config/ghui/projects.toml")
	})

	test("stays silent for directories the scanner could not inspect", () => {
		const snapshots = [projectSnapshot(nonRepoSnapshot(`${ROOT}/locked`, "locked", ROOT, "permission denied"))]
		expect(notARepoCheck.run(snapshots, ctx)).toEqual([])
	})
})

describe("ciRed", () => {
	test("stays silent without GitHub data", () => {
		expect(ciRedCheck.run([projectSnapshot(repo("app"))], ctx)).toEqual([])
	})

	test("stays silent for null, success and non-actionable conclusions", () => {
		for (const conclusion of ["success", "cancelled", "skipped", "neutral", "stale", null] as const) {
			expect(ciRedCheck.run([projectSnapshot(repo("app"), github({ latestRunConclusion: conclusion }))], ctx)).toEqual([])
		}
	})

	test("fires on failure, timed_out and action_required", () => {
		for (const conclusion of ["failure", "timed_out", "action_required"] as const) {
			const findings = ciRedCheck.run([projectSnapshot(repo("app"), github({ latestRunConclusion: conclusion }))], ctx)
			expect(findings).toHaveLength(1)
			expect(findings[0]!.severity).toBe("error")
		}
	})

	test("names the default branch, the age of the run, and carries the run url", () => {
		const snapshots = [
			projectSnapshot(repo("app"), github({ defaultBranch: "trunk", latestRunConclusion: "failure", latestRunAt: daysAgo(3), latestRunUrl: "https://example.invalid/run/1" })),
		]
		const finding = ciRedCheck.run(snapshots, ctx)[0]!
		expect(finding.detail).toBe("Latest run on trunk failed (3 days ago)")
		expect(finding.url).toBe("https://example.invalid/run/1")
	})
})

describe("staleWorktrees", () => {
	test("reports one finding per prunable or missing worktree", () => {
		const snapshots = [
			projectSnapshot(
				repo("app", {
					worktrees: [
						worktree(`${ROOT}/app`, { isMain: true }),
						worktree("/worktrees/one", { isPrunable: true, prunableReason: "gitdir file points to non-existent location", branch: "feat/one" }),
						worktree("/worktrees/two", { isMissing: true }),
						worktree("/worktrees/three"),
					],
				}),
			),
		]
		const findings = staleWorktreesCheck.run(snapshots, ctx)
		expect(findings.map((finding) => finding.id)).toEqual([`staleWorktrees:${ROOT}/app:/worktrees/one`, `staleWorktrees:${ROOT}/app:/worktrees/two`])
		expect(findings[0]!.detail).toBe("/worktrees/one (feat/one): gitdir file points to non-existent location")
		expect(findings[1]!.detail).toBe("/worktrees/two: its directory no longer exists")
		expect(findings[0]!.suggestion).toBe(`git -C ${ROOT}/app worktree prune`)
	})

	test("never reports the main worktree or a locked one", () => {
		const snapshots = [
			projectSnapshot(
				repo("app", {
					worktrees: [worktree(`${ROOT}/app`, { isMain: true, isPrunable: true }), worktree("/worktrees/pinned", { isPrunable: true, isLocked: true, lockReason: "on usb" })],
				}),
			),
		]
		expect(staleWorktreesCheck.run(snapshots, ctx)).toEqual([])
	})

	test("reports a shared worktree once when the worktree itself is also a scanned project", () => {
		// A linked worktree sitting under the scan root is discovered as its own
		// project, and `git worktree list` returns the same set from either side.
		const shared = [worktree(`${ROOT}/app`, { isMain: true }), worktree(`${ROOT}/app-feat`, { isPrunable: true, prunableReason: "gitdir file points to non-existent location" })]
		const snapshots = [projectSnapshot(repo("app", { worktrees: shared })), projectSnapshot(repo("app-feat", { worktrees: shared }))]
		const findings = staleWorktreesCheck.run(snapshots, ctx)
		expect(findings.map((finding) => finding.id)).toEqual([`staleWorktrees:${ROOT}/app:${ROOT}/app-feat`])
	})
})

describe("intent and scan errors gate every check", () => {
	const broken = repo("app", { dirtyCount: 9, lastCommitAt: daysAgo(400), ahead: 4, currentBranch: "feat/x", upstreamRef: "origin/feat/x" })

	test("a shipped or dead project is not nagged about", () => {
		for (const lifecycle of ["shipped", "dead"] as const) {
			expect(runChecks([projectSnapshot(broken, github(), projectIntent(lifecycle))], ctx)).toEqual([])
		}
	})

	test("alive and parked projects are still checked", () => {
		for (const lifecycle of ["alive", "parked"] as const) {
			expect(runChecks([projectSnapshot(broken, github(), projectIntent(lifecycle, "a note"))], ctx).length).toBeGreaterThan(0)
		}
	})

	test("an uninspectable directory produces nothing from any check", () => {
		const unreadable = projectSnapshot({ ...broken, scanError: "permission denied" })
		for (const check of projectChecks) expect(ids([unreadable], check)).toEqual([])
	})
})

describe("runChecks", () => {
	test("sorts by severity, then project name", () => {
		const snapshots = [
			projectSnapshot(nonRepoSnapshot(`${ROOT}/zebra`, "zebra", ROOT)),
			projectSnapshot(repo("beta", { dirtyCount: 2, lastCommitAt: daysAgo(90) })),
			projectSnapshot(nonRepoSnapshot(`${ROOT}/alpha`, "alpha", ROOT)),
		]
		expect(runChecks(snapshots, ctx).map((finding) => [finding.severity, finding.projectName])).toEqual([
			["error", "beta"],
			["warning", "alpha"],
			["warning", "zebra"],
		])
	})

	test("drops GitHub-dependent checks when no snapshot carries remote facts", () => {
		const snapshots = [projectSnapshot(repo("app"))]
		expect(hasGitHubData(snapshots)).toBe(false)
		expect(runCheckIds(snapshots)).toEqual(["dirtyAndStale", "dupRemotes", "staleWorktrees", "notARepo"])
	})

	test("runs every check once any snapshot carries remote facts", () => {
		const snapshots = [projectSnapshot(repo("app"), github()), projectSnapshot(repo("other"))]
		expect(hasGitHubData(snapshots)).toBe(true)
		expect(runCheckIds(snapshots)).toEqual(projectChecks.map((check) => check.id))
	})

	test("githubAvailable: false forces a local-only run", () => {
		const snapshots = [projectSnapshot(repo("app", { ahead: 2, currentBranch: "feat/x" }), github())]
		expect(runChecks(snapshots, ctx, { githubAvailable: false })).toEqual([])
	})

	test("finding ids are unique and stable across runs", () => {
		const snapshots = [
			projectSnapshot(repo("alpha", { remote: "owner/shared", dirtyCount: 1, lastCommitAt: daysAgo(60) })),
			projectSnapshot(repo("beta", { remote: "owner/shared", worktrees: [worktree("/worktrees/one", { isPrunable: true })] })),
		]
		const first = runChecks(snapshots, ctx).map((finding) => finding.id)
		expect(new Set(first).size).toBe(first.length)
		expect(runChecks(snapshots, ctx).map((finding) => finding.id)).toEqual(first)
	})

	test("returns nothing for an empty workspace", () => {
		expect(runChecks([], ctx)).toEqual([])
	})
})
