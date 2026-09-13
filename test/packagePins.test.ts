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
})
