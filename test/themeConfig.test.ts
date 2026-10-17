import { describe, expect, test } from "bun:test"
import { normalizeThemeConfig, resolveStoredThemeId, resolveThemeId, systemThemeConfigForTheme, themeConfigWithSelection } from "../src/themeConfig.js"

describe("resolveStoredThemeId", () => {
	test("maps the pre-rename ghui id onto phui", () => {
		expect(resolveStoredThemeId("ghui")).toBe("phui")
	})

	test("keeps a current theme id", () => {
		expect(resolveStoredThemeId("one-dark")).toBe("one-dark")
	})

	test("falls back when the value is unknown", () => {
		expect(resolveStoredThemeId("not-a-theme")).toBe("phui")
	})
})

describe("normalizeThemeConfig", () => {
	test("maps the legacy ghui theme onto phui", () => {
		expect(normalizeThemeConfig({ theme: "ghui" })).toEqual({ mode: "fixed", theme: "phui" })
	})

	test("keeps existing fixed theme config as the default", () => {
		expect(normalizeThemeConfig({ theme: "one-dark" })).toEqual({ mode: "fixed", theme: "one-dark" })
	})

	test("builds follow-system config with dark and light themes", () => {
		expect(normalizeThemeConfig({ themeMode: "system", darkTheme: "one-dark", lightTheme: "one-light" })).toEqual({
			mode: "system",
			darkTheme: "one-dark",
			lightTheme: "one-light",
		})
	})

	test("falls back to paired themes for invalid system entries", () => {
		expect(normalizeThemeConfig({ themeMode: "system", theme: "one-dark", darkTheme: "one-light", lightTheme: "missing" })).toEqual({
			mode: "system",
			darkTheme: "one-dark",
			lightTheme: "one-light",
		})
	})
})

describe("resolveThemeId", () => {
	test("resolves fixed theme irrespective of appearance", () => {
		const config = { mode: "fixed", theme: "one-dark" } as const
		expect(resolveThemeId(config, "dark")).toBe("one-dark")
		expect(resolveThemeId(config, "light")).toBe("one-dark")
	})

	test("resolves system theme by appearance", () => {
		const config = { mode: "system", darkTheme: "one-dark", lightTheme: "one-light" } as const
		expect(resolveThemeId(config, "dark")).toBe("one-dark")
		expect(resolveThemeId(config, "light")).toBe("one-light")
	})
})

describe("themeConfigWithSelection", () => {
	test("updates the selected system tone only", () => {
		expect(themeConfigWithSelection({ mode: "system", darkTheme: "phui", lightTheme: "one-light" }, "one-light", "light")).toEqual({
			mode: "system",
			darkTheme: "phui",
			lightTheme: "one-light",
		})
	})

	test("creates a paired system config from one fixed theme", () => {
		expect(systemThemeConfigForTheme("one-dark")).toEqual({ mode: "system", darkTheme: "one-dark", lightTheme: "one-light" })
	})
})
