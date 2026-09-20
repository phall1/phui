#!/usr/bin/env bun

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { addDefaultParsers, createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { Effect } from "effect"
import { appendFile } from "node:fs/promises"
import { createSignal } from "solid-js"
import { formatLaunchIntentError, LaunchIntentError, parseLaunchIntent } from "./launchIntent.js"
import { createSystemThemeReloader, type SystemThemeReloadEvent } from "./systemThemeReload.js"
import { setTuiSuspender } from "./tuiSuspension.js"
import { loadStoredSystemThemeAutoReload } from "./themeStore.js"
import { colors, setSystemThemeColors } from "./ui/colors.js"

const launchArgs = process.argv.slice(2)
if (launchArgs.includes("--version") || launchArgs.includes("-v")) {
	const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url).href), "utf8")) as { readonly version: string }
	process.stdout.write(`${pkg.version}\n`)
	process.exit(0)
}

const launchIntent = (() => {
	try {
		return parseLaunchIntent(launchArgs)
	} catch (error) {
		if (!(error instanceof LaunchIntentError)) throw error
		process.stderr.write(`${formatLaunchIntentError(error)}\n`)
		process.exit(1)
	}
})()

process.env.OTUI_USE_ALTERNATE_SCREEN = "true"

const addPhUiParsers = () =>
	addDefaultParsers([
		{
			filetype: "bash",
			aliases: ["sh", "shell", "zsh", "ksh"],
			wasm: "https://github.com/tree-sitter/tree-sitter-bash/releases/download/v0.25.1/tree-sitter-bash.wasm",
			queries: {
				highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-bash/v0.25.1/queries/highlights.scm"],
			},
		},
	])

const FOCUS_REPORTING_ENABLE = "\x1b[?1004h"
const FOCUS_REPORTING_DISABLE = "\x1b[?1004l"
const FULL_SCREEN_REPAINT = "\x1b[2J\x1b[3J\x1b[H"

let notifySystemThemeReload = () => {}

const SYSTEM_THEME_READ_TIMEOUT_MS = 500
const SYSTEM_THEME_DEBUG_LOG_PATH = process.env.PHUI_DEBUG_THEME_RELOAD_LOG ?? null

const logReloadEvent = (event: SystemThemeReloadEvent) => {
	if (SYSTEM_THEME_DEBUG_LOG_PATH === null) return
	const line = `${new Date().toISOString()} ${JSON.stringify(event)}\n`
	void appendFile(SYSTEM_THEME_DEBUG_LOG_PATH, line).catch(() => {})
}

const renderer = await createCliRenderer({
	exitOnCtrlC: false,
	screenMode: "alternate-screen",
	externalOutputMode: "passthrough",
	onDestroy: () => {
		process.stdout.write(FOCUS_REPORTING_DISABLE)
		process.exit(0)
	},
})

renderer.setBackgroundColor(colors.background)

// Let editor-launch (and any future hand-off) suspend the renderer so an
// interactive subprocess (nvim, etc.) can own the terminal, then reacquire it.
setTuiSuspender({
	suspend: () => {
		process.stdout.write(FOCUS_REPORTING_DISABLE)
		renderer.suspend()
	},
	resume: () => {
		renderer.resume()
		process.stdout.write(FOCUS_REPORTING_ENABLE)
		process.stdout.write(FULL_SCREEN_REPAINT)
		renderer.requestRender()
	},
})

const systemThemeReloader = createSystemThemeReloader({
	readPalette: (timeoutMs) => {
		renderer.clearPaletteCache()
		return renderer.getPalette({ timeout: timeoutMs, size: 16 })
	},
	applyColors: (terminalColors) => {
		setSystemThemeColors(terminalColors)
		renderer.setBackgroundColor(colors.background)
	},
	notify: () => notifySystemThemeReload(),
	isAutoReloadEnabled: () => Effect.runPromise(loadStoredSystemThemeAutoReload),
	setTimer: (fn, ms) => globalThis.setTimeout(fn, ms),
	clearTimer: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
	delay: (ms) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms)),
	config: { readTimeoutMs: SYSTEM_THEME_READ_TIMEOUT_MS },
	onEvent: logReloadEvent,
})

void systemThemeReloader.primeBaseline().catch(() => {})

process.on("SIGUSR2", () => {
	systemThemeReloader.requestReload()
})

try {
	addPhUiParsers()
} catch {
	// Syntax highlighting is optional; still mount the app.
}

const [{ RegistryProvider }, { App }] = await Promise.all([import("@effect/atom-solid"), import("./App.js")])

const Root = () => {
	const [systemThemeGeneration, setSystemThemeGeneration] = createSignal(0)
	notifySystemThemeReload = () => setSystemThemeGeneration((current) => current + 1)
	return (
		<RegistryProvider>
			<App systemThemeGeneration={systemThemeGeneration()} launchIntent={launchIntent} />
		</RegistryProvider>
	)
}

process.stdout.write(FOCUS_REPORTING_ENABLE)
if (process.env.PHUI_FORCE_FULL_REPAINT_ON_START === "1") {
	process.stdout.write(FULL_SCREEN_REPAINT)
	renderer.requestRender()
}
globalThis.setTimeout(() => {
	if (process.platform !== "win32") process.kill(process.pid, "SIGWINCH")
	renderer.requestRender()
}, 0)

void render(() => <Root />, renderer)
