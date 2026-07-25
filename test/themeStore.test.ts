import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { loadStoredEditorConfig, loadStoredShowScrollbars, loadStoredSystemThemeAutoReload } from "../src/themeStore.js"

const originalConfigDir = process.env.PHUI_CONFIG_DIR
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME
const tempDirs: string[] = []

const restoreEnvVar = (name: string, original: string | undefined) => {
	if (original === undefined) {
		delete process.env[name]
	} else {
		process.env[name] = original
	}
}

const restoreConfigDir = () => {
	restoreEnvVar("PHUI_CONFIG_DIR", originalConfigDir)
	restoreEnvVar("XDG_CONFIG_HOME", originalXdgConfigHome)
}

afterEach(async () => {
	restoreConfigDir()
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
	tempDirs.length = 0
})

const useTempConfig = async (content?: string) => {
	const dir = await mkdtemp(join(tmpdir(), "phui-theme-store-"))
	tempDirs.push(dir)
	process.env.PHUI_CONFIG_DIR = dir
	if (content !== undefined) await writeFile(join(dir, "config.json"), content)
}

const loadSystemThemeAutoReload = () => Effect.runPromise(loadStoredSystemThemeAutoReload)
const loadShowScrollbars = () => Effect.runPromise(loadStoredShowScrollbars)

describe("loadStoredSystemThemeAutoReload", () => {
	test("defaults to disabled", async () => {
		await useTempConfig()

		expect(await loadSystemThemeAutoReload()).toBe(false)
	})

	test("reads an enabled setting", async () => {
		await useTempConfig('{"systemThemeAutoReload":true}')

		expect(await loadSystemThemeAutoReload()).toBe(true)
	})

	test("reads a disabled setting", async () => {
		await useTempConfig('{"systemThemeAutoReload":false}')

		expect(await loadSystemThemeAutoReload()).toBe(false)
	})

	test("ignores non-boolean values", async () => {
		await useTempConfig('{"systemThemeAutoReload":"true"}')

		expect(await loadSystemThemeAutoReload()).toBe(false)
	})
})

describe("loadStoredShowScrollbars", () => {
	test("defaults to hidden", async () => {
		await useTempConfig()

		expect(await loadShowScrollbars()).toBe(false)
	})

	test("shows scrollbars only when explicitly enabled", async () => {
		await useTempConfig('{"showScrollbars":true}')

		expect(await loadShowScrollbars()).toBe(true)
	})

	test("ignores non-boolean values", async () => {
		await useTempConfig('{"showScrollbars":"true"}')

		expect(await loadShowScrollbars()).toBe(false)
	})
})

const loadEditorConfig = () => Effect.runPromise(loadStoredEditorConfig)

describe("loadStoredEditorConfig", () => {
	test("defaults to no command and empty repoPaths", async () => {
		await useTempConfig()

		expect(await loadEditorConfig()).toEqual({ editorCommand: null, repoPaths: {} })
	})

	test("reads editorCommand and repoPaths", async () => {
		await useTempConfig('{"editorCommand":"nvim {{repoPath}}","repoPaths":{"dlvhdr/gh-dash":"~/code/gh-dash"}}')

		expect(await loadEditorConfig()).toEqual({ editorCommand: "nvim {{repoPath}}", repoPaths: { "dlvhdr/gh-dash": "~/code/gh-dash" } })
	})

	test("treats blank editorCommand as unset", async () => {
		await useTempConfig('{"editorCommand":"   "}')

		expect((await loadEditorConfig()).editorCommand).toBeNull()
	})

	test("drops non-string repoPaths entries", async () => {
		await useTempConfig('{"repoPaths":{"a/b":"/ok","c/d":123,"e/f":""}}')

		expect((await loadEditorConfig()).repoPaths).toEqual({ "a/b": "/ok" })
	})

	test("ignores a non-object repoPaths value", async () => {
		await useTempConfig('{"repoPaths":"nope"}')

		expect((await loadEditorConfig()).repoPaths).toEqual({})
	})
})

describe("pre-rename ghui config", () => {
	// The fork was renamed ghui -> phui. Settings written before the rename must
	// still load, or upgrading silently resets every preference to its default.
	const useTempHome = async (dirs: { readonly phui?: string; readonly ghui?: string }) => {
		const home = await mkdtemp(join(tmpdir(), "phui-legacy-config-"))
		tempDirs.push(home)
		delete process.env.PHUI_CONFIG_DIR
		process.env.XDG_CONFIG_HOME = home
		for (const [name, content] of Object.entries(dirs)) {
			await mkdir(join(home, name), { recursive: true })
			await writeFile(join(home, name, "config.json"), content)
		}
		return home
	}

	test("reads settings from the ghui directory when phui has none", async () => {
		await useTempHome({ ghui: '{"systemThemeAutoReload":true}' })

		expect(await loadSystemThemeAutoReload()).toBe(true)
	})

	test("prefers the phui directory when both exist", async () => {
		// phui carries the non-default value, so a pass cannot come from the
		// fallback winning or from neither file being read at all.
		await useTempHome({ phui: '{"systemThemeAutoReload":true}', ghui: '{"systemThemeAutoReload":false}' })

		expect(await loadSystemThemeAutoReload()).toBe(true)
	})

	test("falls back to defaults when neither directory exists", async () => {
		await useTempHome({})

		expect(await loadSystemThemeAutoReload()).toBe(false)
	})

	test("ignores the ghui directory when PHUI_CONFIG_DIR is set explicitly", async () => {
		const home = await useTempHome({ ghui: '{"systemThemeAutoReload":true}' })
		process.env.PHUI_CONFIG_DIR = join(home, "explicit")

		expect(await loadSystemThemeAutoReload()).toBe(false)
	})
})
