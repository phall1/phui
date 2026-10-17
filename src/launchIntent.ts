export type PhuiLaunchView = "details" | "diff" | "comments" | "runs"

export type PhuiLaunchIntent =
	| { readonly _tag: "Default" }
	| { readonly _tag: "Repository"; readonly repository: string }
	| {
			readonly _tag: "PullRequest"
			readonly repository: string
			readonly number: number
			readonly view: PhuiLaunchView
	  }

export class LaunchIntentError extends Error {
	readonly _tag = "LaunchIntentError"

	constructor(message: string) {
		super(message)
		this.name = "LaunchIntentError"
	}
}

const REPOSITORY_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/
const PULL_REQUEST_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(-?\d+)$/
const GITHUB_REPOSITORY_URL_PATTERN = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/
const GITHUB_PULL_REQUEST_URL_PATTERN = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(-?\d+)\/?$/
const CURRENT_REPOSITORY_PULL_REQUEST_PATTERN = /^#?(-?\d+)$/

/** Resolves the GitHub repository of the working directory; called only when a launch needs it. */
export type CurrentRepository = () => string | null

const noCurrentRepository: CurrentRepository = () => null

const isLaunchView = (value: string): value is PhuiLaunchView => value === "details" || value === "diff" || value === "comments" || value === "runs"

const parseView = (value: string): PhuiLaunchView => {
	if (isLaunchView(value)) return value
	throw new LaunchIntentError(`Invalid --view value: ${value || "(empty)"}. Expected details, diff, comments, or runs.`)
}

const parsePullRequestNumber = (value: string): number => {
	const number = Number(value)
	if (!Number.isSafeInteger(number) || number <= 0) throw new LaunchIntentError("Pull request number must be a positive integer.")
	return number
}

const parseTarget = (target: string, view: PhuiLaunchView | undefined, currentRepository: CurrentRepository): PhuiLaunchIntent => {
	const localPullRequest = target.match(CURRENT_REPOSITORY_PULL_REQUEST_PATTERN)
	if (localPullRequest) {
		const number = parsePullRequestNumber(localPullRequest[1]!)
		const repository = currentRepository()
		if (repository === null) throw new LaunchIntentError(`Target ${target} needs a GitHub repository; run it inside a clone or pass owner/repo#${number}.`)
		return { _tag: "PullRequest", repository, number, view: view ?? "details" }
	}

	const pullRequest = target.match(PULL_REQUEST_PATTERN) ?? target.match(GITHUB_PULL_REQUEST_URL_PATTERN)
	if (pullRequest) {
		const owner = pullRequest[1]!
		const name = pullRequest[2]!
		const number = parsePullRequestNumber(pullRequest[3]!)
		return { _tag: "PullRequest", repository: `${owner}/${name}`, number, view: view ?? "details" }
	}

	const repository = target.match(REPOSITORY_PATTERN) ?? target.match(GITHUB_REPOSITORY_URL_PATTERN)
	if (repository) {
		if (view !== undefined) throw new LaunchIntentError("Option --view requires a pull request target.")
		return { _tag: "Repository", repository: `${repository[1]!}/${repository[2]!}` }
	}

	throw new LaunchIntentError(`Invalid target: ${target || "(empty)"}. Expected owner/repo, owner/repo#123, #123, or a GitHub URL.`)
}

/**
 * With no target, a launch inside a GitHub clone opens that repository, so
 * `phui` in any checkout lands on the code in front of you. `--home` skips that
 * and opens the user-wide workspace.
 */
export const parseLaunchIntent = (args: readonly string[], currentRepository: CurrentRepository = noCurrentRepository): PhuiLaunchIntent => {
	let target: string | undefined
	let view: PhuiLaunchView | undefined
	let home = false

	for (let index = 0; index < args.length; index++) {
		const argument = args[index]!
		let viewValue: string | undefined

		if (argument === "--home") {
			home = true
		} else if (argument === "--view") {
			viewValue = args[index + 1]
			if (viewValue === undefined) throw new LaunchIntentError("Option --view requires a value.")
			index++
		} else if (argument.startsWith("--view=")) {
			viewValue = argument.slice("--view=".length)
		} else if (argument.startsWith("-")) {
			throw new LaunchIntentError(`Unknown option: ${argument}.`)
		} else {
			if (target !== undefined) throw new LaunchIntentError(`Unexpected argument: ${argument}. Only one launch target is allowed.`)
			target = argument
		}

		if (viewValue !== undefined) {
			const nextView = parseView(viewValue)
			if (view !== undefined) {
				if (view === nextView) throw new LaunchIntentError("Option --view may only be specified once.")
				throw new LaunchIntentError(`Conflicting --view values: ${view} and ${nextView}.`)
			}
			view = nextView
		}
	}

	if (target === undefined) {
		if (view !== undefined) throw new LaunchIntentError("Option --view requires a pull request target.")
		if (home) return { _tag: "Default" }
		const repository = currentRepository()
		return repository === null ? { _tag: "Default" } : { _tag: "Repository", repository }
	}

	if (home) throw new LaunchIntentError("Option --home cannot be combined with a launch target.")
	return parseTarget(target, view, currentRepository)
}

export const formatLaunchIntentError = (error: LaunchIntentError): string => `phui: ${error.message}\nRun \`phui --help\` for usage.`
