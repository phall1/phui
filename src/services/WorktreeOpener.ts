import { join } from "node:path"
import { Context, Effect, Layer } from "effect"
import type { PullRequestItem } from "../domain.js"
import { type EditorCommandFields, resolveRepoPath } from "../editorCommand.js"
import { parseGitRemoteUrl } from "../gitRemotes.js"
import { loadStoredWorktreeConfig } from "../themeStore.js"
import { withTuiSuspended } from "../tuiSuspension.js"
import { defaultWorktreePathTemplate, isInsidePhux, phuxSessionName, renderWorktreePath, worktreeBranchName, worktreeExcludeEntry } from "../worktreeCommand.js"
import { CommandError } from "./CommandRunner.js"

const pullRequestFields = (pr: PullRequestItem): EditorCommandFields => ({
	repository: pr.repository,
	number: pr.number,
	headRef: pr.headRefName,
	baseRef: pr.baseRefName,
	author: pr.author,
	url: pr.url,
})

const worktreeError = (detail: string, cause?: unknown) => new CommandError({ command: "worktree", args: [], detail, cause: cause ?? detail })

interface CapturedResult {
	readonly exitCode: number
	readonly stdout: string
	readonly stderr: string
}

const runCaptured = async (cmd: string[], cwd?: string): Promise<CapturedResult> => {
	const proc = Bun.spawn({ cmd, ...(cwd ? { cwd } : {}), stdin: "ignore", stdout: "pipe", stderr: "pipe" })
	const [exitCode, stdout, stderr] = await Promise.all([proc.exited, Bun.readableStreamToText(proc.stdout), Bun.readableStreamToText(proc.stderr)])
	return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
}

const git = async (repoPath: string, args: string[]): Promise<string> => {
	const result = await runCaptured(["git", "-C", repoPath, ...args])
	if (result.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`)
	return result.stdout
}

/** The remote whose URL points at the PR's repository — pull refs only exist there. */
const findRemoteFor = async (repoPath: string, repository: string): Promise<string> => {
	const names = (await git(repoPath, ["remote"]))
		.split("\n")
		.map((name) => name.trim())
		.filter(Boolean)
	for (const name of names) {
		const url = await runCaptured(["git", "-C", repoPath, "remote", "get-url", name])
		if (url.exitCode === 0 && parseGitRemoteUrl(url.stdout) === repository) return name
	}
	throw new Error(`No git remote in ${repoPath} points at ${repository}`)
}

const ensureExcluded = async (gitCommonDir: string, entry: string): Promise<void> => {
	const excludePath = join(gitCommonDir, "info", "exclude")
	const file = Bun.file(excludePath)
	const current = (await file.exists()) ? await file.text() : ""
	if (current.split("\n").some((line) => line.trim() === entry)) return
	await Bun.write(excludePath, `${current}${current.length > 0 && !current.endsWith("\n") ? "\n" : ""}${entry}\n`)
}

const ensureWorktree = async (repoPath: string, worktreePath: string, pr: PullRequestItem): Promise<"created" | "existing"> => {
	if (await Bun.file(join(worktreePath, ".git")).exists()) return "existing"
	const gitCommonDir = await git(repoPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
	const remote = await findRemoteFor(repoPath, pr.repository)
	await git(repoPath, ["fetch", remote, `refs/pull/${pr.number}/head`])
	const excludeEntry = worktreeExcludeEntry(repoPath, worktreePath)
	if (excludeEntry) await ensureExcluded(gitCommonDir, excludeEntry)
	// Prune first so a hand-deleted worktree directory doesn't leave its branch
	// registered as "checked out elsewhere" and block the add.
	await git(repoPath, ["worktree", "prune"])
	await git(repoPath, ["worktree", "add", "-B", worktreeBranchName(pr.number), worktreePath, "FETCH_HEAD"])
	return "created"
}

const phuxMissing = (cause: unknown) => {
	const message = cause instanceof Error ? cause.message : ""
	return /not found|ENOENT/i.test(message) ? new Error("phux not found in PATH") : cause
}

const phuxAttach = async (session: string, cwd: string): Promise<void> => {
	// `phux new NAME` is create-or-attach; on detach the TUI resumes.
	try {
		const proc = Bun.spawn({ cmd: ["phux", "new", session, "-c", cwd], stdin: "inherit", stdout: "inherit", stderr: "inherit" })
		const exitCode = await proc.exited
		if (exitCode !== 0) throw new Error(`phux exited with code ${exitCode}`)
	} catch (cause) {
		throw phuxMissing(cause)
	}
}

const phuxCreateDetached = async (session: string, cwd: string): Promise<void> => {
	let result: CapturedResult
	try {
		result = await runCaptured(["phux", "new", "-s", session, "--json", "-c", cwd])
	} catch (cause) {
		throw phuxMissing(cause)
	}
	// A session that already exists is success — the worktree is already hosted.
	if (result.exitCode !== 0 && !/already/i.test(result.stderr)) throw new Error(result.stderr || `phux new exited with code ${result.exitCode}`)
}

const openSession = async (repoPath: string, worktreePath: string, pr: PullRequestItem): Promise<string> => {
	const state = await ensureWorktree(repoPath, worktreePath, pr)
	const session = phuxSessionName(pullRequestFields(pr))
	if (isInsidePhux(process.env)) {
		await phuxCreateDetached(session, worktreePath)
		return `phux session "${session}" ready (${state} worktree) — switch to it in phux`
	}
	await withTuiSuspended(() => phuxAttach(session, worktreePath))
	return `Detached from phux session "${session}"`
}

export class WorktreeOpener extends Context.Service<
	WorktreeOpener,
	{
		/** Succeeds with the footer-notice text describing what was opened. */
		readonly openPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<string, CommandError>
	}
>()("phui/WorktreeOpener") {
	static readonly layerNoDeps = Layer.effect(
		WorktreeOpener,
		Effect.gen(function* () {
			const openPullRequest = Effect.fn("WorktreeOpener.openPullRequest")(function* (pullRequest: PullRequestItem) {
				const { worktreePath: template, repoPaths } = yield* loadStoredWorktreeConfig
				const repoPath = resolveRepoPath(repoPaths, pullRequest.repository)
				if (repoPath === null) {
					return yield* worktreeError(`No repoPaths entry matched ${pullRequest.repository}; add one in config.json`)
				}
				const worktreePath = renderWorktreePath(template ?? defaultWorktreePathTemplate, pullRequestFields(pullRequest), repoPath)
				return yield* Effect.tryPromise({
					try: () => openSession(repoPath, worktreePath, pullRequest),
					catch: (cause) => worktreeError(cause instanceof Error ? cause.message : "Failed to open worktree", cause),
				})
			})

			return WorktreeOpener.of({ openPullRequest })
		}),
	)

	static readonly layer = WorktreeOpener.layerNoDeps

	// Headless no-op for mock mode / tests.
	static readonly mockLayer = Layer.succeed(
		WorktreeOpener,
		WorktreeOpener.of({
			openPullRequest: () => Effect.succeed(""),
		}),
	)
}
