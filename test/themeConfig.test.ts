import { describe, expect, test } from "bun:test"
import { normalizeThemeConfig, resolveStoredThemeId, resolveThemeId, systemThemeConfigForTheme, themeConfigWithSelection } from "../src/themeConfig.js"

describe("resolveStoredThemeId", () => {
	test("maps the pre-rename ghui id onto phui", () => {
		expect(resolveStoredThemeId("ghui")).toBe("phui")
	})

	test("keeps a current theme id", () => {
		expect(resolveStoredThemeId("catppuccin")).toBe("catppuccin")
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
		expect(normalizeThemeConfig({ theme: "catppuccin" })).toEqual({ mode: "fixed", theme: "catppuccin" })
	})

	test("builds follow-system config with dark and light themes", () => {
		expect(normalizeThemeConfig({ themeMode: "system", darkTheme: "catppuccin", lightTheme: "catppuccin-latte" })).toEqual({
			mode: "system",
			darkTheme: "catppuccin",
			lightTheme: "catppuccin-latte",
		})
	})

	test("falls back to paired themes for invalid system entries", () => {
		expect(normalizeThemeConfig({ themeMode: "system", theme: "solarized-dark", darkTheme: "solarized-light", lightTheme: "missing" })).toEqual({
			mode: "system",
			darkTheme: "solarized-dark",
			lightTheme: "solarized-light",
		})
	})
})

describe("resolveThemeId", () => {
	test("resolves fixed theme irrespective of appearance", () => {
		const config = { mode: "fixed", theme: "rose-pine" } as const
		expect(resolveThemeId(config, "dark")).toBe("rose-pine")
		expect(resolveThemeId(config, "light")).toBe("rose-pine")
	})

	test("resolves system theme by appearance", () => {
		const config = { mode: "system", darkTheme: "rose-pine", lightTheme: "rose-pine-dawn" } as const
		expect(resolveThemeId(config, "dark")).toBe("rose-pine")
		expect(resolveThemeId(config, "light")).toBe("rose-pine-dawn")
	})
})

describe("themeConfigWithSelection", () => {
	test("updates the selected system tone only", () => {
		expect(themeConfigWithSelection({ mode: "system", darkTheme: "phui", lightTheme: "catppuccin-latte" }, "rose-pine-dawn", "light")).toEqual({
			mode: "system",
			darkTheme: "phui",
			lightTheme: "rose-pine-dawn",
		})
	})

	test("creates a paired system config from one fixed theme", () => {
		expect(systemThemeConfigForTheme("gruvbox")).toEqual({ mode: "system", darkTheme: "gruvbox", lightTheme: "gruvbox-light" })
	})
})
