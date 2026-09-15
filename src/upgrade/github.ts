import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { ChecksumMismatchError, DownloadError, GithubApiError, NoReleaseAssetError, UpgradeFailedError } from "./errors.js"
import { platformAssetSuffix } from "./channel.js"

const REPO = "phall1/phui"
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`

interface ReleaseAsset {
	readonly name: string
	readonly browser_download_url: string
}

interface LatestRelease {
	readonly tag_name: string
	readonly assets: readonly ReleaseAsset[]
}

export interface UpgradeInfo {
	readonly latestVersion: string
	readonly assetUrl: string
	readonly checksumUrl: string
}

const asWebResponse = (response: unknown): Response => response as Response

const fetchJson = (url: string): Effect.Effect<unknown, GithubApiError> =>
	Effect.tryPromise({
		try: async () => {
			const response = asWebResponse(
				await fetch(url, {
					headers: {
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
						"User-Agent": "phui-upgrade",
					},
				}),
			)
			if (!response.ok) {
				throw new GithubApiError({
					status: response.status,
					body: await response.text(),
					url,
				})
			}
			return response.json()
		},
		catch: (error) => (error instanceof GithubApiError ? error : new GithubApiError({ status: 0, body: String(error), url })),
	})

const fetchText = (url: string): Effect.Effect<string, DownloadError> =>
	Effect.tryPromise({
		try: async () => {
			const response = asWebResponse(await fetch(url))
			if (!response.ok) {
				throw new DownloadError({ status: response.status, url })
			}
			return response.text()
		},
		catch: (error) => (error instanceof DownloadError ? error : new DownloadError({ status: 0, url })),
	})

const fetchBytes = (url: string): Effect.Effect<Uint8Array, DownloadError> =>
	Effect.tryPromise({
		try: async () => {
			const response = asWebResponse(await fetch(url))
			if (!response.ok) {
				throw new DownloadError({ status: response.status, url })
			}
			return new Uint8Array(await response.arrayBuffer())
		},
		catch: (error) => (error instanceof DownloadError ? error : new DownloadError({ status: 0, url })),
	})

const sha256 = (bytes: Uint8Array): string => {
	const hash = createHash("sha256")
	hash.update(bytes)
	return hash.digest("hex")
}

const readFileBytes = (filePath: string): Effect.Effect<Uint8Array, UpgradeFailedError> =>
	Effect.try({
		try: () => new Uint8Array(fs.readFileSync(filePath)),
		catch: (error) =>
			new UpgradeFailedError({
				message: error instanceof Error ? error.message : String(error),
			}),
	})

const ensureCacheDir = (): Effect.Effect<string, UpgradeFailedError> =>
	Effect.try({
		try: () => {
			const dir = path.join(os.homedir(), ".cache", "phui", "upgrade")
			fs.mkdirSync(dir, { recursive: true })
			return dir
		},
		catch: (error) =>
			new UpgradeFailedError({
				message: error instanceof Error ? error.message : String(error),
			}),
	})

export const findLatestStandaloneAsset = (): Effect.Effect<UpgradeInfo, NoReleaseAssetError | GithubApiError> =>
	Effect.gen(function* () {
		const suffix = platformAssetSuffix()
		if (!suffix) {
			return yield* new NoReleaseAssetError({
				message: `Unsupported platform: ${os.platform()}-${os.arch()}`,
			})
		}

		const release = (yield* fetchJson(GITHUB_API)) as LatestRelease
		const tag = release.tag_name
		const assetName = `phui-${suffix}.tar.gz`
		const checksumName = `${assetName}.sha256`

		const asset = release.assets.find((a) => a.name === assetName)
		const checksum = release.assets.find((a) => a.name === checksumName)
		if (!asset) {
			return yield* new NoReleaseAssetError({
				message: `No release asset found for ${assetName} in ${tag}`,
			})
		}
		if (!checksum) {
			return yield* new NoReleaseAssetError({
				message: `No checksum asset found for ${checksumName} in ${tag}`,
			})
		}

		return {
			latestVersion: tag.replace(/^v/, ""),
			assetUrl: asset.browser_download_url,
			checksumUrl: checksum.browser_download_url,
		}
	})

export const downloadAndVerify = (info: UpgradeInfo): Effect.Effect<string, ChecksumMismatchError | DownloadError | UpgradeFailedError> =>
	Effect.gen(function* () {
		const cacheDir = yield* ensureCacheDir()
		const archivePath = path.join(cacheDir, `phui-${info.latestVersion}.tar.gz`)
		const checksumLine = (yield* fetchText(info.checksumUrl)).trim().split(/\s+/)[0]
		const expectedHash = checksumLine ?? ""

		const currentHash = fs.existsSync(archivePath) ? sha256(yield* readFileBytes(archivePath)) : null

		if (currentHash !== expectedHash) {
			const bytes = yield* fetchBytes(info.assetUrl)
			const downloadedHash = sha256(bytes)
			if (downloadedHash !== expectedHash) {
				return yield* new ChecksumMismatchError({
					expected: expectedHash,
					actual: downloadedHash,
				})
			}
			fs.writeFileSync(archivePath, bytes)
		}

		const actualHash = sha256(yield* readFileBytes(archivePath))
		if (actualHash !== expectedHash) {
			fs.unlinkSync(archivePath)
			return yield* new ChecksumMismatchError({
				expected: expectedHash,
				actual: actualHash,
			})
		}

		return archivePath
	})
