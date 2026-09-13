import { describe, expect, test } from "bun:test"
import packageJson from "../package.json" with { type: "json" }

describe("daily-driver package pins", () => {
	test("OpenTUI React 0.5.11 and Effect 4.0.0-beta.107 are pinned", () => {
		const dependencies = packageJson.dependencies
		expect(dependencies["@opentui/core"]).toBe("0.5.11")
		expect(dependencies["@opentui/react"]).toBe("0.5.11")
		expect(dependencies.react).toBe("19.2.7")
		expect(dependencies.scheduler).toBe("0.27.0")
		expect(dependencies.effect).toBe("4.0.0-beta.107")
		expect(dependencies["@effect/atom-react"]).toBe("4.0.0-beta.107")
		expect(dependencies["@effect/sql-sqlite-bun"]).toBe("4.0.0-beta.107")
		expect(dependencies).not.toHaveProperty("@opentui/solid")
		expect(dependencies).not.toHaveProperty("@effect/atom-solid")
		expect(dependencies).not.toHaveProperty("solid-js")
		expect(dependencies.effect).not.toContain("rc.115")
	})
})
