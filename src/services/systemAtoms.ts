import type { CreatePullRequestCommentInput, CreatePullRequestInput, PullRequestItem, SubmitPullRequestReviewInput } from "../domain.js"
import { BrowserOpener } from "./BrowserOpener.js"
import { Clipboard } from "./Clipboard.js"
import { EditorOpener } from "./EditorOpener.js"
import { GitHubService } from "./GitHubService.js"
import { githubRuntime } from "./runtime.js"

export const submitPullRequestReviewAtom = githubRuntime.fn<SubmitPullRequestReviewInput>()((input) => GitHubService.use((github) => github.submitPullRequestReview(input)))
export const findPendingReviewAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.findPendingReview(input.repository, input.number)),
)
export const createPendingReviewAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly commitId: string }>()((input) =>
	GitHubService.use((github) => github.createPendingReview(input.repository, input.number, input.commitId)),
)
export const addPendingReviewCommentAtom = githubRuntime.fn<{
	readonly repository: string
	readonly number: number
	readonly reviewId: string
	readonly input: CreatePullRequestCommentInput
}>()((input) => GitHubService.use((github) => github.addPendingReviewComment(input.repository, input.number, input.reviewId, input.input)))
export const queuePendingDiffCommentAtom = githubRuntime.fn<CreatePullRequestCommentInput>()((input) => GitHubService.use((github) => github.queuePendingDiffComment(input)))
export const submitPendingReviewAtom = githubRuntime.fn<{
	readonly repository: string
	readonly number: number
	readonly reviewId: string
	readonly event: SubmitPullRequestReviewInput["event"]
	readonly body: string
}>()((input) => GitHubService.use((github) => github.submitPendingReview(input.repository, input.number, input.reviewId, input.event, input.body)))
export const discardPendingReviewAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly reviewId: string }>()((input) =>
	GitHubService.use((github) => github.discardPendingReview(input.repository, input.number, input.reviewId)),
)
export const listReviewThreadsAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.listReviewThreads(input.repository, input.number)),
)
export const resolveReviewThreadAtom = githubRuntime.fn<string>()((threadId) => GitHubService.use((github) => github.resolveReviewThread(threadId)))
export const unresolveReviewThreadAtom = githubRuntime.fn<string>()((threadId) => GitHubService.use((github) => github.unresolveReviewThread(threadId)))
export const addReviewersAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly reviewers: readonly string[] }>()((input) =>
	GitHubService.use((github) => github.addReviewers(input.repository, input.number, input.reviewers)),
)
export const removeReviewersAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly reviewers: readonly string[] }>()((input) =>
	GitHubService.use((github) => github.removeReviewers(input.repository, input.number, input.reviewers)),
)
export const addAssigneesAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly assignees: readonly string[] }>()((input) =>
	GitHubService.use((github) => github.addAssignees(input.repository, input.number, input.assignees)),
)
export const removeAssigneesAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly assignees: readonly string[] }>()((input) =>
	GitHubService.use((github) => github.removeAssignees(input.repository, input.number, input.assignees)),
)
export const updatePullRequestBranchAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.updatePullRequestBranch(input.repository, input.number)),
)
export const reopenPullRequestAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.reopenPullRequest(input.repository, input.number)),
)
export const reopenIssueAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.reopenIssue(input.repository, input.number)),
)
export const editPullRequestTitleBodyAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number; readonly title: string; readonly body: string }>()((input) =>
	GitHubService.use((github) => github.editPullRequestTitleBody(input.repository, input.number, input.title, input.body)),
)
export const createPullRequestAtom = githubRuntime.fn<CreatePullRequestInput>()((input) => GitHubService.use((github) => github.createPullRequest(input)))
export const getWorkflowRunLogsAtom = githubRuntime.fn<{ readonly repository: string; readonly runId: number; readonly failedOnly: boolean }>()((input) =>
	GitHubService.use((github) => github.getWorkflowRunLogs(input.repository, input.runId, input.failedOnly)),
)
export const copyToClipboardAtom = githubRuntime.fn<string>()((text) => Clipboard.use((clipboard) => clipboard.copy(text)))
export const openInBrowserAtom = githubRuntime.fn<PullRequestItem>()((pullRequest) => BrowserOpener.use((browser) => browser.openPullRequest(pullRequest)))
export const openUrlAtom = githubRuntime.fn<string>()((url) => BrowserOpener.use((browser) => browser.openUrl(url)))
export const openInEditorAtom = githubRuntime.fn<PullRequestItem>()((pullRequest) => EditorOpener.use((editor) => editor.openPullRequest(pullRequest)))
