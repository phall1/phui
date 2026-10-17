import { describe, expect, test } from "bun:test"
import { filterThemeDefinitions, isThemeId, pairedThemeId, themeToneForThemeId } from "../src/ui/colors.js"

describe("filterThemeDefinitions", () => {
	test("keeps dark and light themes in separate lists", () => {
		expect(filterThemeDefinitions("", "dark").map((theme) => theme.id)).toEqual(["system", "phui", "one-dark"])
		expect(filterThemeDefinitions("", "light").map((theme) => theme.id)).toEqual(["one-light"])
	})

	test("filters only within the selected tone", () => {
		expect(filterThemeDefinitions("one", "dark").map((theme) => theme.id)).toEqual(["one-dark"])
		expect(filterThemeDefinitions("one", "light").map((theme) => theme.id)).toEqual(["one-light"])
	})
})

describe("themeToneForThemeId", () => {
	test("identifies light theme variants", () => {
		expect(themeToneForThemeId("one-light")).toBe("light")
		expect(themeToneForThemeId("one-dark")).toBe("dark")
	})
})

describe("isThemeId", () => {
	test("rejects removed theme ids so stored config falls back", () => {
		expect(isThemeId("catppuccin")).toBe(false)
		expect(isThemeId("phui")).toBe(true)
	})
})

describe("pairedThemeId", () => {
	test("returns the matching light or dark variant when one exists", () => {
		expect(pairedThemeId("one-dark", "light")).toBe("one-light")
		expect(pairedThemeId("one-light", "dark")).toBe("one-dark")
		expect(pairedThemeId("phui", "light")).toBeNull()
	})
})
