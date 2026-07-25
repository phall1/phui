import type { PullRequestItem } from "./domain.js"
import { errorMessage } from "./errors.js"
import type { PhuiLaunchIntent, PhuiLaunchView } from "./launchIntent.js"

export interface PullRequestLaunchViewState {
	readonly detailFullView: boolean
	readonly diffFullView: boolean
	readonly commentsViewActive: boolean
	readonly runsFullView: boolean
}

export const pullRequestLaunchViewState = (view: PhuiLaunchView): PullRequestLaunchViewState => ({
	detailFullView: view === "details",
	diffFullView: view === "diff",
	commentsViewActive: view === "comments",
	runsFullView: view === "runs",
})

export const findLaunchPullRequestIndex = (pullRequests: readonly PullRequestItem[], target: Pick<PullRequestItem, "repository" | "number">): number =>
	pullRequests.findIndex((pullRequest) => pullRequest.repository === target.repository && pullRequest.number === target.number)

export interface LaunchBootstrapActions {
	readonly openRepository: (repository: string) => void
	readonly hydratePullRequest: (input: { readonly repository: string; readonly number: number }) => Promise<PullRequestItem>
	readonly selectPullRequest: (pullRequest: PullRequestItem) => boolean
	readonly showNotice: (message: string) => void
}

export type LaunchBootstrapResult =
	| { readonly _tag: "Default" }
	| { readonly _tag: "RepositoryReady"; readonly repository: string }
	| { readonly _tag: "PullRequestReady"; readonly pullRequest: PullRequestItem; readonly view: PhuiLaunchView }
	| { readonly _tag: "PullRequestFailed"; readonly repository: string; readonly number: number; readonly error: string }

/**
 * Applies the semantic part of a launch exactly once at the App-shell boundary.
 * View opening remains a React concern because it must wait for the selected PR
 * to be observable in the next render. Failures resolve to a value after
 * notifying, so repository navigation stays usable.
 */
export const applyLaunchIntent = async (intent: PhuiLaunchIntent, actions: LaunchBootstrapActions): Promise<LaunchBootstrapResult> => {
	if (intent._tag === "Default") return { _tag: "Default" }

	actions.openRepository(intent.repository)
	if (intent._tag === "Repository") return { _tag: "RepositoryReady", repository: intent.repository }

	try {
		const pullRequest = await actions.hydratePullRequest({ repository: intent.repository, number: intent.number })
		if (!actions.selectPullRequest(pullRequest)) throw new Error(`Unable to select ${intent.repository}#${intent.number} after loading it.`)
		return { _tag: "PullRequestReady", pullRequest, view: intent.view }
	} catch (error) {
		const message = errorMessage(error)
		actions.showNotice(message)
		return { _tag: "PullRequestFailed", repository: intent.repository, number: intent.number, error: message }
	}
}
