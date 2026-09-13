import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { GitHubService } from "../../services/GitHubService.js"
import { githubRuntime } from "../../services/runtime.js"

// === UI state ===

// `runs` is a full-screen PR view mode, a peer of `diff` / `comments`. The flag
// lives here (read by useViewModeState + PullRequestSurface + the keymap layer).
export const runsFullViewAtom = Atom.make(false)
export const runsLogsOpenAtom = Atom.make(false)

// Which run (if any) is drilled into — null = runs list (view A); set = run detail
// (view B). Cleared when the runs view closes.
export const selectedRunIdAtom = Atom.make<number | null>(null)

// Cursors. `runsListSelectionAtom` walks the runs list; `runDetailSelectionAtom`
// walks the flattened job/step rows inside a run.
export const runsListSelectionAtom = Atom.make(0)
export const runDetailSelectionAtom = Atom.make(0)

export const repositoryRunsListSelectionAtom = Atom.make(0)
export const repositoryRunDetailSelectionAtom = Atom.make(0)
export const repositorySelectedRunIdAtom = Atom.make<number | null>(null)

// === Keying ===
//
// Runs are scoped to a PR revision (repo + number + head SHA) so a force-push
// gets fresh runs. Run details / logs are keyed by run id under the repository.

export const runsKey = (pr: { repository: string; number: number; headRefOid: string }) => `${pr.repository}\u0000${pr.number}\u0000${pr.headRefOid}`

const parseRunsKey = (key: string): { repository: string; headSha: string } => {
	const [repository, , headSha] = key.split("\u0000")
	return { repository: repository ?? "", headSha: headSha ?? "" }
}

export const runDetailKey = (repository: string, runId: number) => `${repository}\u0000${runId}`

const parseRunDetailKey = (key: string): { repository: string; runId: number } => {
	const [repository, runId] = key.split("\u0000")
	return { repository: repository ?? "", runId: Number(runId ?? 0) }
}

// === Data families ===

export const pullRequestRunsFor = Atom.family((key: string) => {
	const { repository, headSha } = parseRunsKey(key)
	if (!repository || !headSha) return githubRuntime.atom(Effect.succeed<readonly import("../../domain.js").WorkflowRun[]>([])).pipe(Atom.setIdleTTL(0))
	return githubRuntime.atom(GitHubService.use((github) => github.listWorkflowRunsForCommit(repository, headSha))).pipe(Atom.setIdleTTL(0))
})

export const repositoryWorkflowRunsFor = Atom.family((repository: string) =>
	githubRuntime
		.atom(repository ? GitHubService.use((github) => github.listRepositoryWorkflowRuns(repository)) : Effect.succeed<readonly import("../../domain.js").WorkflowRun[]>([]))
		.pipe(Atom.setIdleTTL(0)),
)

export const workflowRunDetailsFor = Atom.family((key: string) => {
	const { repository, runId } = parseRunDetailKey(key)
	if (!repository || runId <= 0) return githubRuntime.atom(Effect.never)
	return githubRuntime.atom(GitHubService.use((github) => github.getWorkflowRunDetails(repository, runId))).pipe(Atom.setIdleTTL(0))
})

export const rerunWorkflowRunAtom = githubRuntime.fn<{ readonly repository: string; readonly runId: number; readonly failedOnly: boolean }>()((input) =>
	GitHubService.use((github) => github.rerunWorkflowRun(input.repository, input.runId, input.failedOnly)),
)

export const cancelWorkflowRunAtom = githubRuntime.fn<{ readonly repository: string; readonly runId: number }>()((input) =>
	GitHubService.use((github) => github.cancelWorkflowRun(input.repository, input.runId)),
)
