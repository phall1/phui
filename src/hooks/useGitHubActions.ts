import { RegistryContext, useAtomSet as useAtomSetSolid } from "@effect/atom-solid"
import { useContext } from "../solid-utils.js"
import {
	addPullRequestLabelAtom,
	closePullRequestAtom,
	hydrateTargetedPullRequestAtom,
	prewarmRepositoryDetailsAtom,
	pruneCacheAtom,
	removePullRequestLabelAtom,
	toggleDraftAtom,
} from "../ui/pullRequests/atoms.js"
import { addIssueLabelAtom, closeIssueAtom, issuesAtom, removeIssueLabelAtom } from "../ui/issues/atoms.js"
import { listIssueCommentsAtom, listPullRequestCommentsAtom } from "../ui/comments/atoms.js"
import { openUrlAtom, submitPullRequestReviewAtom } from "../services/systemAtoms.js"
import { readRepoRollupAtom, readWorkspacePreferencesAtom, writeWorkspacePreferencesAtom } from "../workspace/atoms.js"

/**
 * Bundle of `useAtomSet` calls for every GitHubService action the App
 * fires. Stays a separate hook so the bulk of action wiring isn't
 * inlined in App.tsx — and so adding a new action only touches this
 * file plus the consuming surface.
 */
export const useGitHubActions = () => {
	const addPullRequestLabel = useAtomSetSolid(() => addPullRequestLabelAtom, { mode: "promise" })
	const removePullRequestLabel = useAtomSetSolid(() => removePullRequestLabelAtom, { mode: "promise" })
	const addIssueLabel = useAtomSetSolid(() => addIssueLabelAtom, { mode: "promise" })
	const removeIssueLabel = useAtomSetSolid(() => removeIssueLabelAtom, { mode: "promise" })
	const toggleDraftStatus = useAtomSetSolid(() => toggleDraftAtom, { mode: "promise" })
	const hydrateTargetedPullRequest = useAtomSetSolid(() => hydrateTargetedPullRequestAtom, { mode: "promise" })
	const listPullRequestComments = useAtomSetSolid(() => listPullRequestCommentsAtom, { mode: "promise" })
	const listIssueComments = useAtomSetSolid(() => listIssueCommentsAtom, { mode: "promise" })
	const readWorkspacePreferences = useAtomSetSolid(() => readWorkspacePreferencesAtom, { mode: "promise" })
	const writeWorkspacePreferences = useAtomSetSolid(() => writeWorkspacePreferencesAtom, { mode: "promise" })
	const pruneCache = useAtomSetSolid(() => pruneCacheAtom, { mode: "promise" })
	const prewarmRepositoryDetails = useAtomSetSolid(() => prewarmRepositoryDetailsAtom, { mode: "promise" })
	const closePullRequest = useAtomSetSolid(() => closePullRequestAtom, { mode: "promise" })
	const closeIssue = useAtomSetSolid(() => closeIssueAtom, { mode: "promise" })
	const registry = useContext(RegistryContext)
	const refreshIssues = () => registry.refresh(issuesAtom)
	const submitPullRequestReview = useAtomSetSolid(() => submitPullRequestReviewAtom, { mode: "promise" })
	const openUrl = useAtomSetSolid(() => openUrlAtom, { mode: "promise" })
	const readRepoRollup = useAtomSetSolid(() => readRepoRollupAtom, { mode: "promise" })
	return {
		addPullRequestLabel,
		removePullRequestLabel,
		addIssueLabel,
		removeIssueLabel,
		toggleDraftStatus,
		hydrateTargetedPullRequest,
		listPullRequestComments,
		listIssueComments,
		readWorkspacePreferences,
		writeWorkspacePreferences,
		pruneCache,
		prewarmRepositoryDetails,
		closePullRequest,
		closeIssue,
		refreshIssues,
		submitPullRequestReview,
		openUrl,
		readRepoRollup,
	}
}
