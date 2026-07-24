import type { PullRequestItem } from "./domain.js"
import type { ItemLoad } from "./item/load.js"
import type { PullRequestView } from "./pullRequestViews.js"

export interface PullRequestLoad extends ItemLoad<PullRequestView, PullRequestItem> {
	/**
	 * PRs deep-linked for this process. They remain in the in-memory
	 * repository load across first-page refreshes, but are removed before the
	 * queue snapshot is persisted because they did not necessarily match it.
	 */
	readonly targetedPullRequestKeys?: readonly string[]
}
