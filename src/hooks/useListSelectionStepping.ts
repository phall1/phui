import type { IssueItem, PullRequestItem } from "../domain.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import type { RepositoryListItem } from "../ui/RepoList.js"

export interface UseListSelectionSteppingInput {
	readonly getActiveWorkspaceSurface: () => WorkspaceSurface
	readonly getVisiblePullRequests: () => readonly PullRequestItem[]
	readonly getIssues: () => readonly IssueItem[]
	readonly getRepositoryItems: () => readonly RepositoryListItem[]
	readonly getLoadMoreSlotAvailable: () => boolean
	readonly getIssueLoadMoreSlotAvailable: () => boolean
	readonly getGroupStarts: () => readonly number[]
	readonly getCurrentGroupIndex: (current: number) => number
	readonly setSelectedIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedIssueIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedRepositoryIndex: (next: number | ((current: number) => number)) => void
}

export interface ListSelectionStepping {
	readonly stepSelected: (delta: number) => void
	readonly stepSelectedDown: (count?: number) => void
	readonly stepSelectedUp: (count?: number) => void
	readonly stepSelectedDownWithLoadMore: () => void
	readonly stepSelectedUpWrap: () => void
	readonly moveSelectedToPreviousGroup: () => void
	readonly moveSelectedToNextGroup: () => void
}

/**
 * Movement helpers shared across surfaces. Each helper routes to the right
 * list (repo/issue/PR) based on `activeWorkspaceSurface`.
 *
 * For the PR list, when `loadMoreSlotAvailable` is true the valid index range
 * is `[0, visiblePullRequests.length]` — one past the last PR represents the
 * load-more pseudo-row. Stepping down past the tail lands on it; pressing
 * Enter there triggers `loadMorePullRequests` via the keymap layer (not from
 * here). j-wrap behaviour at the very bottom wraps to 0 like before.
 *
 * Up-stepping never wraps — PR/Issue lists are long and load lazily, so wrap-
 * to-bottom would jump past unloaded rows.
 */
export const useListSelectionStepping = ({
	getActiveWorkspaceSurface,
	getVisiblePullRequests,
	getIssues,
	getRepositoryItems,
	getLoadMoreSlotAvailable,
	getIssueLoadMoreSlotAvailable,
	getGroupStarts,
	getCurrentGroupIndex,
	setSelectedIndex,
	setSelectedIssueIndex,
	setSelectedRepositoryIndex,
}: UseListSelectionSteppingInput): ListSelectionStepping => {
	const prMaxIndex = () => Math.max(0, getVisiblePullRequests().length - 1 + (getLoadMoreSlotAvailable() ? 1 : 0))
	const issueMaxIndex = () => Math.max(0, getIssues().length - 1 + (getIssueLoadMoreSlotAvailable() ? 1 : 0))
	const moveSelectedToPreviousGroup = () =>
		setSelectedIndex((current) => {
			if (getActiveWorkspaceSurface() !== "pullRequests") return current
			const visiblePullRequests = getVisiblePullRequests()
			const groupStarts = getGroupStarts()
			if (visiblePullRequests.length === 0 || groupStarts.length === 0) return 0
			const currentGroup = getCurrentGroupIndex(current)
			if (currentGroup <= 0) return groupStarts[groupStarts.length - 1]!
			return groupStarts[currentGroup - 1]!
		})
	const moveSelectedToNextGroup = () =>
		setSelectedIndex((current) => {
			if (getActiveWorkspaceSurface() !== "pullRequests") return current
			const visiblePullRequests = getVisiblePullRequests()
			const groupStarts = getGroupStarts()
			if (visiblePullRequests.length === 0 || groupStarts.length === 0) return 0
			const currentGroup = getCurrentGroupIndex(current)
			if (currentGroup >= groupStarts.length - 1) return groupStarts[0]!
			return groupStarts[currentGroup + 1]!
		})
	const stepSelected = (delta: number) => {
		const surface = getActiveWorkspaceSurface()
		if (surface === "repos") {
			setSelectedRepositoryIndex((current) => {
				const repositoryItems = getRepositoryItems()
				if (repositoryItems.length === 0) return 0
				return Math.max(0, Math.min(repositoryItems.length - 1, current + delta))
			})
			return
		}
		if (surface === "issues") {
			setSelectedIssueIndex((current) => {
				if (getIssues().length === 0) return 0
				return Math.max(0, Math.min(issueMaxIndex(), current + delta))
			})
			return
		}
		setSelectedIndex((current) => {
			if (getVisiblePullRequests().length === 0) return 0
			return Math.max(0, Math.min(prMaxIndex(), current + delta))
		})
	}
	const stepSelectedDown = (count = 1) => stepSelected(count)
	const stepSelectedUp = (count = 1) => stepSelected(-count)
	const stepSelectedDownWithLoadMore = () => {
		const surface = getActiveWorkspaceSurface()
		if (surface === "repos") {
			setSelectedRepositoryIndex((current) => {
				const repositoryItems = getRepositoryItems()
				if (repositoryItems.length === 0) return 0
				return current >= repositoryItems.length - 1 ? 0 : current + 1
			})
			return
		}
		if (surface === "issues") {
			setSelectedIssueIndex((current) => {
				if (getIssues().length === 0) return 0
				const max = issueMaxIndex()
				return current >= max ? 0 : current + 1
			})
			return
		}
		setSelectedIndex((current) => {
			if (getVisiblePullRequests().length === 0) return 0
			const max = prMaxIndex()
			return current >= max ? 0 : current + 1
		})
	}
	const stepSelectedUpWrap = () => {
		const surface = getActiveWorkspaceSurface()
		if (surface === "repos") {
			setSelectedRepositoryIndex((current) => Math.max(0, current - 1))
			return
		}
		if (surface === "issues") {
			setSelectedIssueIndex((current) => Math.max(0, current - 1))
			return
		}
		setSelectedIndex((current) => Math.max(0, current - 1))
	}

	return { stepSelected, stepSelectedDown, stepSelectedUp, stepSelectedDownWithLoadMore, stepSelectedUpWrap, moveSelectedToPreviousGroup, moveSelectedToNextGroup }
}
