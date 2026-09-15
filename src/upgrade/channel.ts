import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type InstallChannel = "npm" | "brew" | "standalone" | "source" | "unknown"

export interface ChannelRoots {
	readonly brewPrefix: string | null
	readonly npmRoot: string | null
	readonly pnpmHome?: string | null
	readonly yarnGlobal?: string | null
}

const isInside = (file: string, parent: string) => {
	const relative = path.relative(parent, file)
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

const realFile = (candidate: string | undefined): string | null => {
	if (!candidate) return null
	try {
		if (!fs.existsSync(candidate)) return null
		const resolved = fs.realpathSync(candidate)
		if (!fs.statSync(resolved).isFile()) return null
		return resolved
	} catch {
		return null
	}
}

const isSourcePath = (binPath: string) => binPath.endsWith(".ts") || binPath.includes(`${path.sep}src${path.sep}`) || binPath.endsWith(`${path.sep}src`)

const isBrewInstall = (binPath: string, prefix: string | null) => {
	if (!prefix) return false
	return isInside(binPath, path.join(prefix, "Cellar")) || isInside(binPath, path.join(prefix, "opt", "phui"))
}

const isNpmLikeInstall = (binPath: string, roots: ChannelRoots) => {
	if (roots.npmRoot && isInside(binPath, roots.npmRoot)) return true
	if (roots.pnpmHome && isInside(binPath, roots.pnpmHome)) return true
	if (roots.yarnGlobal && isInside(binPath, roots.yarnGlobal)) return true
	return false
}

const isStandaloneInstall = (binPath: string) => {
	const dir = path.dirname(binPath)
	return !fs.existsSync(path.join(dir, "node_modules")) && !fs.existsSync(path.join(dir, "package.json"))
}

export const channelFromPath = (binPath: string, roots: ChannelRoots): InstallChannel => {
	if (isSourcePath(binPath)) return "source"
	if (isBrewInstall(binPath, roots.brewPrefix)) return "brew"
	if (isNpmLikeInstall(binPath, roots)) return "npm"
	if (isStandaloneInstall(binPath)) return "standalone"
	return "unknown"
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

const yarnGlobalDir = (): string | null => {
	try {
		return execFileSync("yarn", ["global", "dir"], { encoding: "utf8" }).trim()
	} catch {
		return null
	}
}

export const runningBinaryPath = (): string | null => {
	const fromArgv1 = realFile(process.argv[1])
	if (fromArgv1) return fromArgv1
	const fromExec = realFile(process.execPath)
	if (fromExec && path.basename(fromExec).startsWith("phui")) return fromExec
	return realFile(process.argv[0])
}

export const detectInstallChannel = (): InstallChannel => {
	if (process.env.PHUI_INSTALL_CHANNEL) return process.env.PHUI_INSTALL_CHANNEL as InstallChannel

	const binPath = runningBinaryPath()
	if (!binPath) return "unknown"

	return channelFromPath(binPath, {
		brewPrefix: brewPrefix(),
		npmRoot: globalNpmRoot(),
		pnpmHome: process.env.PNPM_HOME ?? null,
		yarnGlobal: yarnGlobalDir(),
	})
}

export const platformAssetSuffix = (): string | null => {
	const osName = os.platform() === "darwin" ? "darwin" : os.platform() === "linux" ? "linux" : null
	const archName = os.arch() === "arm64" ? "arm64" : os.arch() === "x64" ? "x64" : null
	if (!osName || !archName) return null
	return `${osName}-${archName}`
}

export const isSourceRun = (): boolean => {
	const binPath = runningBinaryPath()
	return binPath === null || isSourcePath(binPath)
}
