import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type InstallChannel = "npm" | "brew" | "standalone" | "source" | "unknown"

const isInside = (file: string, parent: string) => {
	const relative = path.relative(parent, file)
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

const globalNpmRoot = (): string | null => {
	try {
		return execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()
	} catch {
		return null
	}
}

const brewPrefix = (): string | null => {
	try {
		return execFileSync("brew", ["--prefix"], { encoding: "utf8" }).trim()
	} catch {
		return null
	}
}

const isBrewInstall = (binPath: string, prefix: string | null) => {
	if (!prefix) return false
	return isInside(binPath, path.join(prefix, "Cellar")) || isInside(binPath, prefix)
}

const isNpmLikeInstall = (binPath: string) => {
	const npmRoot = globalNpmRoot()
	if (npmRoot && isInside(binPath, npmRoot)) return true
	try {
		const globalModules = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["root", "-g"], { encoding: "utf8" }).trim()
		if (globalModules && isInside(binPath, globalModules)) return true
	} catch {}
	try {
		// pnpm global dir
		const pnpmHome = process.env.PNPM_HOME
		if (pnpmHome && isInside(binPath, pnpmHome)) return true
	} catch {}
	try {
		// yarn global dir
		const yarnGlobal = execFileSync("yarn", ["global", "dir"], { encoding: "utf8" }).trim()
		if (yarnGlobal && isInside(binPath, yarnGlobal)) return true
	} catch {}
	return false
}

const isStandaloneInstall = (binPath: string) => {
	// Standalone compiled binaries are single files without node_modules beside them.
	const dir = path.dirname(binPath)
	return !existsSync(path.join(dir, "node_modules")) && !existsSync(path.join(dir, "package.json"))
}

export const detectInstallChannel = (): InstallChannel => {
	if (process.env.PHUI_INSTALL_CHANNEL) return process.env.PHUI_INSTALL_CHANNEL as InstallChannel

	let binPath: string
	try {
		binPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : fileURLToPath(import.meta.url)
	} catch {
		return "unknown"
	}

	// If the binary is being run directly from a source checkout, don't self-replace.
	if (binPath.endsWith(".ts") || binPath.includes("src" + path.sep)) return "source"

	const brew = brewPrefix()
	if (isBrewInstall(binPath, brew)) return "brew"
	if (isNpmLikeInstall(binPath)) return "npm"
	if (isStandaloneInstall(binPath)) return "standalone"
	return "unknown"
}

export const platformAssetSuffix = (): string | null => {
	const osName = os.platform() === "darwin" ? "darwin" : os.platform() === "linux" ? "linux" : null
	const archName = os.arch() === "arm64" ? "arm64" : os.arch() === "x64" ? "x64" : null
	if (!osName || !archName) return null
	return `${osName}-${archName}`
}

export const runningBinaryPath = (): string | null => {
	try {
		return process.argv[1] ? fs.realpathSync(process.argv[1]) : null
	} catch {
		return null
	}
}

export const isSourceRun = (): boolean => {
	const binPath = runningBinaryPath()
	return binPath === null || binPath.endsWith(".ts") || binPath.includes("src" + path.sep)
}
