import { Data } from "effect"

export class NoReleaseAssetError extends Data.TaggedError("NoReleaseAssetError")<{
	readonly message: string
}> {}

export class ChecksumMismatchError extends Data.TaggedError("ChecksumMismatchError")<{
	readonly expected: string
	readonly actual: string
}> {}

export class AlreadyUpToDateError extends Data.TaggedError("AlreadyUpToDateError")<{
	readonly currentVersion: string
}> {}

export class SourceRunError extends Data.TaggedError("SourceRunError")<{
	readonly message: string
}> {}

export class GithubApiError extends Data.TaggedError("GithubApiError")<{ readonly status: number; readonly body: string; readonly url: string }> {}

export class DownloadError extends Data.TaggedError("DownloadError")<{ readonly status: number; readonly url: string }> {}

export class CommandFailedError extends Data.TaggedError("CommandFailedError")<{
	readonly command: string
	readonly cause: string
}> {}

export class UnsupportedChannelError extends Data.TaggedError("UnsupportedChannelError")<{
	readonly channel: string
}> {}

export class UpgradeFailedError extends Data.TaggedError("UpgradeFailedError")<{
	readonly message: string
}> {}
