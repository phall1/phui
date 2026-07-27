import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { emptyProjectsConfig, type ProjectsConfig } from "../../src/projects/config.ts"
import { discoverProjectDirectories, scanProjects } from "../../src/projects/scan.ts"

// Every path here is built inside an OS temp directory at run time — no real
// scan root belongs in this repo.

const roots: string[] = []

const makeRoot = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), "phui-projects-scan-"))
	roots.push(root)
	return root
}

const git = async (cwd: string, ...args: string[]) => {
	const proc = Bun.spawn({ cmd: ["git", ...args], cwd, stdout: "ignore", stderr: "ignore" })
	await proc.exited
}

const makeRepo = async (path: string) => {
	await Bun.write(join(path, ".keep"), "")
	await git(path, "init", "-q")
}

const config = (overrides: Partial<ProjectsConfig>): ProjectsConfig => ({ ...emptyProjectsConfig, ...overrides })

const discover = (cfg: ProjectsConfig) => Effect.runPromise(discoverProjectDirectories(cfg))

afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true })
})

describe("discoverProjectDirectories — nested scan roots", () => {
	// `visited` dedupes on a first-come basis, so an outer root's walk used to
	// claim the inner root's directory before the inner root's own pass ran:
	// its projects were never scanned AND it was reported as a stray directory.
	// The result must not depend on the order the user listed the roots in.
	const build = async () => {
		const base = await makeRoot()
		const experiments = join(base, "experiments")
		await makeRepo(join(base, "top"))
		await makeRepo(join(experiments, "alpha"))
		await makeRepo(join(experiments, "beta"))
		return { base, experiments }
	}

	const names = (result: { readonly directories: readonly { readonly name: string; readonly kind: string }[] }) =>
		[...result.directories].map((directory) => `${directory.name}:${directory.kind}`).sort()

	test("scans a nested root's projects no matter which order the roots are listed in", async () => {
		const { base, experiments } = await build()
		const outerFirst = await discover(config({ roots: [base, experiments], maxDepth: 1 }))
		const innerFirst = await discover(config({ roots: [experiments, base], maxDepth: 1 }))

		expect(names(outerFirst)).toEqual(["alpha:repository", "beta:repository", "top:repository"])
		expect(names(innerFirst)).toEqual(names(outerFirst))
	})

	test("a configured root is a container, never a 'not a repository' candidate", async () => {
		const { base, experiments } = await build()
		const result = await discover(config({ roots: [base, experiments], maxDepth: 1 }))
		expect(result.directories.some((directory) => directory.name === "experiments")).toBe(false)
		expect(result.warnings).toEqual([])
	})

	test("without the nested root configured, the container is still reported as a stray", async () => {
		const { base } = await build()
		const result = await discover(config({ roots: [base], maxDepth: 1 }))
		expect(names(result)).toEqual(["experiments:directory", "top:repository"])
	})
})

describe("scanProjects — last commit date", () => {
	// A rebase, amend or cherry-pick rewrites the committer date and leaves the
	// author date at the original writing. Staleness asks "when was this last
	// touched", so it must read the committer date: reading the author date
	// reported a branch rebased today as months old, and the skew is unbounded.
	const gitWithDates = async (cwd: string, authorDate: string, committerDate: string, ...args: string[]) => {
		const proc = Bun.spawn({
			cmd: ["git", ...args],
			cwd,
			env: { ...process.env, GIT_AUTHOR_DATE: authorDate, GIT_COMMITTER_DATE: committerDate },
			stdout: "ignore",
			stderr: "ignore",
		})
		await proc.exited
	}

	test("reports the committer date when a rebase moved it past the author date", async () => {
		const root = await makeRoot()
		const repoPath = join(root, "rebased")
		await Bun.write(join(repoPath, "file.txt"), "content")
		await git(repoPath, "init", "-q")
		await git(repoPath, "config", "user.email", "test@example.com")
		await git(repoPath, "config", "user.name", "Test")
		await git(repoPath, "add", "-A")
		await gitWithDates(repoPath, "2020-01-01T00:00:00Z", "2024-06-15T12:00:00Z", "commit", "-q", "-m", "written long ago, replayed later")

		const result = await Effect.runPromise(scanProjects(config({ roots: [root], maxDepth: 1 })))
		const scanned = result.projects.find((project) => project.repo.name === "rebased")

		expect(scanned?.repo.lastCommitAt?.toISOString()).toBe("2024-06-15T12:00:00.000Z")
	})
})
