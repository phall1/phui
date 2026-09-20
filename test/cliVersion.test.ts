import { describe, expect, test } from "bun:test"
import packageJson from "../package.json" with { type: "json" }

describe("CLI version", () => {
	test("the source fallback launcher uses the Solid JSX preload", async () => {
		const text = await Bun.file(new URL("../bin/phui.js", import.meta.url)).text()
		expect(text).toContain("--preload")
		expect(text).toContain("@opentui/solid/preload")
		expect(text).toContain("cwd: packageRoot")
	})

	test("bin/phui.js --version prints the package version", async () => {
		const proc = Bun.spawn(["node", "bin/phui.js", "--version"], {
			stdout: "pipe",
			stderr: "pipe",
			cwd: import.meta.dir + "/..",
		})
		const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
		expect(stderr).toBe("")
		expect(exitCode).toBe(0)
		expect(stdout.trim()).toBe(packageJson.version)
	})

	test("bun run src/index.tsx --version prints the package version", async () => {
		const proc = Bun.spawn(["bun", "--preload", "@opentui/solid/preload", "src/index.tsx", "--version"], {
			stdout: "pipe",
			stderr: "pipe",
			cwd: import.meta.dir + "/..",
		})
		const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
		expect(stderr).toBe("")
		expect(exitCode).toBe(0)
		expect(stdout.trim()).toBe(packageJson.version)
	})
})
