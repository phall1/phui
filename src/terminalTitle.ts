import type { PullRequestItem } from "./domain.js"
import type { WorkspaceSurface } from "./workspaceSurfaces.js"

export type TerminalTitlePullRequest = Pick<PullRequestItem, "repository" | "number">

export interface TerminalTitleState {
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly selectedRepository: string | null
	readonly selectedPullRequest: TerminalTitlePullRequest | null
	readonly detailFullView: boolean
	readonly diffFullView: boolean
	readonly commentsViewActive: boolean
	readonly runsFullView: boolean
}

export interface TerminalTitleOutput {
	readonly isTTY?: boolean
	readonly write: (sequence: string) => unknown
}

export type TerminalTitleWriter = (title: string) => boolean

const CONTROL_CHARACTERS = /\p{Cc}/gu
const WHITESPACE = /\s+/g

export const sanitizeTerminalTitle = (title: string): string => title.replace(CONTROL_CHARACTERS, " ").replace(WHITESPACE, " ").trim()

const activePullRequestView = ({ commentsViewActive, runsFullView, diffFullView, detailFullView }: TerminalTitleState): string | null => {
	// Keep this in the same order as PullRequestSurface's full-screen rendering.
	if (commentsViewActive) return "comments"
	if (runsFullView) return "runs"
	if (diffFullView) return "diff"
	if (detailFullView) return "details"
	return null
}

export const deriveTerminalTitle = (state: TerminalTitleState): string => {
	const repository = sanitizeTerminalTitle(state.selectedRepository ?? "")

	if (state.activeWorkspaceSurface === "issues" || state.activeWorkspaceSurface === "actions") {
		return repository.length > 0 ? `phui · ${repository} · ${state.activeWorkspaceSurface}` : "phui"
	}

	if (state.activeWorkspaceSurface !== "pullRequests") return "phui"

	if (state.selectedPullRequest) {
		const pullRequestRepository = sanitizeTerminalTitle(state.selectedPullRequest.repository) || repository
		const pullRequestScope = pullRequestRepository.length > 0 ? `${pullRequestRepository}#${state.selectedPullRequest.number}` : `#${state.selectedPullRequest.number}`
		const view = activePullRequestView(state)
		return view === null ? `phui · ${pullRequestScope}` : `phui · ${pullRequestScope} · ${view}`
	}

	return repository.length > 0 ? `phui · ${repository}` : "phui"
}

export const encodeTerminalTitle = (title: string): string => `\u001b]0;${sanitizeTerminalTitle(title)}\u0007`

export const createTerminalTitleWriter = (write: (sequence: string) => unknown): TerminalTitleWriter => {
	let previousSequence: string | null = null
	return (title) => {
		const sequence = encodeTerminalTitle(title)
		if (sequence === previousSequence) return false
		write(sequence)
		previousSequence = sequence
		return true
	}
}

export const createTerminalTitleWriterForOutput = (output: TerminalTitleOutput | undefined): TerminalTitleWriter | null =>
	output?.isTTY === true ? createTerminalTitleWriter((sequence) => output.write(sequence)) : null
