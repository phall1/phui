#!/usr/bin/env node

import childProcess from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const requireFromHere = createRequire(import.meta.url)

const packageJson = requireFromHere("../package.json")

const platformMap = {
	darwin: "darwin",
	linux: "linux",
}

const archMap = {
	arm64: "arm64",
	x64: "x64",
}

const help = `phui ${packageJson.version}

Terminal UI for GitHub pull requests.

Usage:
  phui [target] [--view <view>]
  phui upgrade
  phui -v, --version
  phui -h, --help

Targets:
  owner/repo                         Open a repository
  owner/repo#123                     Open a pull request
  https://github.com/owner/repo      Open a GitHub repository URL
  https://github.com/owner/repo/pull/123
                                     Open a GitHub pull request URL

Options:
  --view details|diff|comments|runs  Open a pull request view (default: details)

Commands:
  upgrade                            Upgrade phui to the latest release
  -v, --version                      Print the installed version
  -h, --help                         Show this help message
`

const run = (target, args = process.argv.slice(2), options = {}) => {
	const result = childProcess.spawnSync(target, args, { stdio: "inherit", ...options })
	if (result.error) {
		console.error(result.error.message)
		process.exit(1)
	}
	process.exit(typeof result.status === "number" ? result.status : 0)
}

const scriptPath = fs.realpathSync(__filename)
const scriptDir = path.dirname(scriptPath)
const packageRoot = path.join(scriptDir, "..")
const SOLID_PRELOAD = "@opentui/solid/preload"

const resolveScriptEntry = () => {
	if (process.env.PHUI_BIN_PATH) return null
	const sourceEntry = path.join(packageRoot, "src", "standalone.ts")
	if (fs.existsSync(sourceEntry)) return sourceEntry
	return null
}

const runFromSource = (args = process.argv.slice(2)) => {
	const sourceEntry = resolveScriptEntry()
	if (!sourceEntry) return false
	// Same preload `bun run start` uses. Without it, bun does not run the
	// Solid JSX transform and the TUI paints the splash then never updates.
	run("bun", ["--preload", SOLID_PRELOAD, sourceEntry, ...args], { cwd: packageRoot })
	return true
}

const resolveBinary = () => {
	const platform = platformMap[os.platform()]
	const arch = archMap[os.arch()]
	if (!platform || !arch) return null
	const name = `${packageJson.name}-${platform}-${arch}`
	try {
		const packageJsonPath = requireFromHere.resolve(`${name}/package.json`)
		return path.join(path.dirname(packageJsonPath), "bin", "phui")
	} catch {
		return null
	}
}

if (process.env.PHUI_BIN_PATH) {
	run(process.env.PHUI_BIN_PATH)
}

if (process.argv[2] === "-h" || process.argv[2] === "--help" || process.argv[2] === "help") {
	console.log(help)
	process.exit(0)
}

if (process.argv[2] === "-v" || process.argv[2] === "--version" || process.argv[2] === "version") {
	console.log(packageJson.version)
	process.exit(0)
}

if (process.argv[2] === "upgrade") {
	if (!runFromSource(["upgrade"])) {
		const binaryPath = resolveBinary()
		if (binaryPath && fs.existsSync(binaryPath)) {
			run(binaryPath, ["upgrade"])
		}
		console.error("Could not find a phui binary to upgrade.")
		console.error(`  npm install -g ${packageJson.name}@latest`)
		process.exit(1)
	}
}

const isMusl = () => {
	if (os.platform() !== "linux") return false
	try {
		if (fs.existsSync("/etc/alpine-release")) return true
	} catch {}
	try {
		const result = childProcess.spawnSync("ldd", ["--version"], { encoding: "utf8" })
		return `${result.stdout ?? ""}${result.stderr ?? ""}`.toLowerCase().includes("musl")
	} catch {
		return false
	}
}

const platform = platformMap[os.platform()]
const arch = archMap[os.arch()]

if (!platform || !arch) {
	console.error(`Unsupported platform for ${packageJson.name}: ${os.platform()}-${os.arch()}`)
	process.exit(1)
}

if (platform === "linux" && isMusl()) {
	console.error(`${packageJson.name} does not publish musl Linux binaries yet.`)
	console.error("Use a glibc-based Linux distribution, Homebrew on Linux, or the source checkout with Bun.")
	process.exit(1)
}

const binaryPath = resolveBinary()

if (!binaryPath || !fs.existsSync(binaryPath)) {
	if (!runFromSource()) {
		const fallbackName = `${packageJson.name}-${platform}-${arch}`
		console.error(`Could not find the ${fallbackName} binary package for this platform.`)
		console.error(`Try reinstalling ${packageJson.name}, or install ${fallbackName} manually.`)
		process.exit(1)
	}
}

run(binaryPath)
