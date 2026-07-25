import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { emptyProjectsConfig, type ProjectsConfig } from "../../src/projects/config.ts"
import { discoverProjectDirectories } from "../../src/projects/scan.ts"

// Every path here is built inside an OS temp directory at run time — no real
// scan root belongs in this repo.

const roots: string[] = []

const makeRoot = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), "ghui-projects-scan-"))
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
