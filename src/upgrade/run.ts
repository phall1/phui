import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import packageJson from "../../package.json" with { type: "json" }
import {
	AlreadyUpToDateError,
	ChecksumMismatchError,
	CommandFailedError,
	DownloadError,
	GithubApiError,
	NoReleaseAssetError,
	SourceRunError,
	UnsupportedChannelError,
	UpgradeFailedError,
} from "./errors.js"
import { detectInstallChannel, isSourceRun, runningBinaryPath } from "./channel.js"
import { downloadAndVerify, findLatestStandaloneAsset } from "./github.js"

const compareVersions = (current: string, latest: string): number => {
	const parse = (version: string) => version.replace(/^v/, "").split(".").map(Number)
	const left = parse(current)
	const right = parse(latest)
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const a = left[i] ?? 0
		const b = right[i] ?? 0
		if (a !== b) return a - b
	}
	return 0
}

const runCommand = (command: string, args: readonly string[]): Effect.Effect<number, CommandFailedError> =>
	Effect.try({
		try: () => {
			const result = spawnSync(command, args, { stdio: "inherit" })
			if (result.error) throw result.error
			return typeof result.status === "number" ? result.status : 0
		},
		catch: (error) =>
			new CommandFailedError({
				command: `${command} ${args.join(" ")}`,
				cause: error instanceof Error ? error.message : String(error),
			}),
	})

const extractTarGz = (archivePath: string, extractDir: string): Effect.Effect<void, UpgradeFailedError> =>
	Effect.try({
		try: () => {
			fs.mkdirSync(extractDir, { recursive: true })
			const result = spawnSync("tar", ["-xzf", archivePath, "-C", extractDir])
			if (result.status !== 0) throw new Error("Failed to extract upgrade archive.")
		},
		catch: (error) =>
			new UpgradeFailedError({
				message: error instanceof Error ? error.message : String(error),
			}),
	})

const replaceBinary = (binaryPath: string, newBinaryPath: string): Effect.Effect<void, UpgradeFailedError> =>
	Effect.try({
		try: () => {
			const backupPath = `${binaryPath}.backup`
			try {
				fs.renameSync(binaryPath, backupPath)
				fs.copyFileSync(newBinaryPath, binaryPath)
				fs.chmodSync(binaryPath, 0o755)
				fs.unlinkSync(backupPath)
			} catch (error) {
				try {
					if (fs.existsSync(backupPath) && !fs.existsSync(binaryPath)) {
						fs.renameSync(backupPath, binaryPath)
					}
				} catch {}
				throw error
			}
		},
		catch: (error) =>
			new UpgradeFailedError({
				message: error instanceof Error ? error.message : String(error),
			}),
	})

type UpgradeError = AlreadyUpToDateError | SourceRunError | UpgradeFailedError | ChecksumMismatchError | DownloadError | GithubApiError | NoReleaseAssetError

const upgradeStandalone = (currentVersion: string): Effect.Effect<string, UpgradeError> =>
	Effect.gen(function* () {
		if (isSourceRun()) {
			return yield* new SourceRunError({
				message: "Cannot self-update when running from source. Install a standalone binary or use your package manager.",
			})
		}

		const binaryPath = runningBinaryPath()
		if (!binaryPath || !fs.existsSync(binaryPath)) {
			return yield* new SourceRunError({ message: "Could not determine the path of the running phui binary." })
		}

		const info = yield* findLatestStandaloneAsset()

		if (compareVersions(currentVersion, info.latestVersion) >= 0) {
			return yield* new AlreadyUpToDateError({ currentVersion })
		}

		yield* Effect.sync(() => console.log(`Upgrading phui from ${currentVersion} to ${info.latestVersion}...`))
		const archivePath = yield* downloadAndVerify(info)

		const extractDir = path.join(os.homedir(), ".cache", "phui", "upgrade", info.latestVersion)
		yield* extractTarGz(archivePath, extractDir)

		const newBinary = path.join(extractDir, "phui")
		if (!fs.existsSync(newBinary)) {
			return yield* new UpgradeFailedError({
				message: "Upgrade archive did not contain a 'phui' binary.",
			})
		}

		yield* replaceBinary(binaryPath, newBinary)
		return info.latestVersion
	})

const printUpgradeHints = (): Effect.Effect<void, never> =>
	Effect.sync(() => {
		console.error("Could not detect how phui was installed. Upgrade manually:")
		console.error(`  Homebrew:  brew upgrade phui`)
		console.error(`  npm:       npm install -g ${packageJson.name}@latest`)
		console.error(`  Standalone: download the latest release from https://github.com/${process.env.PHUI_REPO ?? "phall1/phui"}/releases`)
	})

export const runUpgrade = (): Effect.Effect<number, never> =>
	Effect.gen(function* () {
		const channel = detectInstallChannel()

		switch (channel) {
			case "brew":
				yield* Effect.sync(() => console.log("Upgrading phui via Homebrew..."))
				return yield* runCommand("brew", ["upgrade", "phui"])
			case "npm":
				yield* Effect.sync(() => console.log(`Upgrading ${packageJson.name} via npm...`))
				return yield* runCommand("npm", ["install", "-g", `${packageJson.name}@latest`])
			case "standalone": {
				const newVersion = yield* upgradeStandalone(packageJson.version)
				yield* Effect.sync(() => console.log(`phui upgraded to ${newVersion}.`))
				return 0
			}
			case "source":
				yield* Effect.sync(() => console.error("Running from source. Pull latest and run `bun install` to update."))
				return 1
			case "unknown":
			default:
				yield* printUpgradeHints()
				return yield* new UnsupportedChannelError({ channel })
		}
	}).pipe(
		Effect.catchTags({
			AlreadyUpToDateError: () =>
				Effect.sync(() => {
					console.log(`phui is up to date (${packageJson.version}).`)
					return 0
				}),
			CommandFailedError: (error) =>
				Effect.sync(() => {
					console.error(`Command failed: ${error.command} (${error.cause})`)
					return 1
				}),
			SourceRunError: (error) =>
				Effect.sync(() => {
					console.error(error.message)
					return 1
				}),
			UnsupportedChannelError: () => Effect.succeed(1),
			UpgradeFailedError: (error) =>
				Effect.sync(() => {
					console.error(error.message)
					return 1
				}),
			ChecksumMismatchError: (error) =>
				Effect.sync(() => {
					console.error(`Checksum mismatch: expected ${error.expected}, got ${error.actual}`)
					return 1
				}),
			DownloadError: (error) =>
				Effect.sync(() => {
					console.error(`Download failed (${error.status}): ${error.url}`)
					return 1
				}),
			GithubApiError: (error) =>
				Effect.sync(() => {
					console.error(`GitHub API error (${error.status}): ${error.url}`)
					return 1
				}),
			NoReleaseAssetError: (error) =>
				Effect.sync(() => {
					console.error(error.message)
					return 1
				}),
		}),
	)
