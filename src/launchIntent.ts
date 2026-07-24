export type GhuiLaunchView = "details" | "diff" | "comments" | "runs"

export type GhuiLaunchIntent =
	| { readonly _tag: "Default" }
	| { readonly _tag: "Repository"; readonly repository: string }
	| {
			readonly _tag: "PullRequest"
			readonly repository: string
			readonly number: number
			readonly view: GhuiLaunchView
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

const isLaunchView = (value: string): value is GhuiLaunchView => value === "details" || value === "diff" || value === "comments" || value === "runs"

const parseView = (value: string): GhuiLaunchView => {
	if (isLaunchView(value)) return value
	throw new LaunchIntentError(`Invalid --view value: ${value || "(empty)"}. Expected details, diff, comments, or runs.`)
}

const parsePullRequestNumber = (value: string): number => {
	const number = Number(value)
	if (!Number.isSafeInteger(number) || number <= 0) throw new LaunchIntentError("Pull request number must be a positive integer.")
	return number
}

const parseTarget = (target: string, view: GhuiLaunchView | undefined): GhuiLaunchIntent => {
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

	throw new LaunchIntentError(`Invalid target: ${target || "(empty)"}. Expected owner/repo, owner/repo#123, or a GitHub URL.`)
}

export const parseLaunchIntent = (args: readonly string[]): GhuiLaunchIntent => {
	let target: string | undefined
	let view: GhuiLaunchView | undefined

	for (let index = 0; index < args.length; index++) {
		const argument = args[index]!
		let viewValue: string | undefined

		if (argument === "--view") {
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
		return { _tag: "Default" }
	}

	return parseTarget(target, view)
}

export const formatLaunchIntentError = (error: LaunchIntentError): string => `ghui: ${error.message}\nRun \`ghui --help\` for usage.`
