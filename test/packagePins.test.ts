import { describe, expect, test } from "bun:test"
import packageJson from "../package.json" with { type: "json" }

describe("daily-driver package pins", () => {
	test("OpenTUI Solid 0.5.11 and Effect 4.0.0-rc.115 are pinned", () => {
		const dependencies = packageJson.dependencies
		expect(dependencies["@opentui/core"]).toBe("0.5.11")
		expect(dependencies["@opentui/solid"]).toBe("0.5.11")
		expect(dependencies["solid-js"]).toBe("1.9.12")
		expect(dependencies.effect).toBe("4.0.0-rc.115")
		expect(dependencies["@effect/atom-solid"]).toBe("4.0.0-rc.115")
		expect(dependencies["@effect/sql-sqlite-bun"]).toBe("4.0.0-rc.115")
		expect(dependencies).not.toHaveProperty("@opentui/react")
		expect(dependencies).not.toHaveProperty("@effect/atom-react")
		expect(dependencies).not.toHaveProperty("react")
		expect(dependencies).not.toHaveProperty("scheduler")
	})

	test("linux binary packages do not set libc, so npm cannot skip them when Node omits glibcVersionRuntime", async () => {
		const text = await Bun.file("dev/build-npm-packages.ts").text()
		expect(text).not.toMatch(/libc:\s*\[/)
	})

	test("GitHub Actions install the Bun version in .bun-version", async () => {
		const bunVersion = (await Bun.file(".bun-version").text()).trim()
		expect(bunVersion).toBe("1.3.14")
		expect(packageJson.devDependencies["@types/bun"]).toBe(bunVersion)

		for (const name of ["ci.yml", "fork-publish.yml"]) {
			const text = await Bun.file(`.github/workflows/${name}`).text()
			const setupCount = [...text.matchAll(/uses: oven-sh\/setup-bun@v2/g)].length
			const pinCount = [...text.matchAll(/bun-version-file: \.bun-version/g)].length
			expect(setupCount, name).toBeGreaterThan(0)
			expect(pinCount, name).toBe(setupCount)
		}
	})
})
