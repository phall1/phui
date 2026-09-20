import { RegistryContext, useAtom, useAtomSet } from "../atom-solid.js"
import { useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { createEffect, onCleanup } from "solid-js"
import { createSignal } from "solid-js"
import { useContext } from "../solid-hooks.js"
import { selectedPullRequestAtom } from "../ui/pullRequests/atoms.js"
import { selectedRepositoryAtom, workspaceSurfaceAtom } from "../workspace/atoms.js"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Cause from "effect/Cause"
import type { PullRequestItem, WorkflowRun, WorkflowRunDetails } from "../domain.js"
import { errorMessage } from "../errors.js"
import type { RunsViewCtx } from "../keymap/runsView.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import { openUrlAtom } from "../services/systemAtoms.js"
import {
	pullRequestRunsFor,
	cancelWorkflowRunAtom,
	repositoryRunDetailSelectionAtom,
	repositoryRunsListSelectionAtom,
	repositorySelectedRunIdAtom,
	repositoryWorkflowRunsFor,
	rerunWorkflowRunAtom,
	runDetailKey,
	runDetailSelectionAtom,
	runsFullViewAtom,
	runsKey,
	runsListSelectionAtom,
	selectedRunIdAtom,
	workflowRunDetailsFor,
} from "../ui/runs/atoms.js"
import { canCancelRun, canRerunFailedJobs, canRerunRun, failureRowIndices, flattenRunRows, type RunDetailRow } from "../ui/runs/runsRows.js"

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)))

type ResultState<A> = { readonly status: "loading" } | { readonly status: "error"; readonly message: string } | { readonly status: "ready"; readonly value: A }

const toState = <A, E>(result: AsyncResult.AsyncResult<A, E>): ResultState<A> => {
	if (AsyncResult.isSuccess(result)) return { status: "ready", value: result.value }
	if (AsyncResult.isFailure(result)) return { status: "error", message: errorMessage(Cause.squash(result.cause)) }
	return { status: "loading" }
}

export interface RunsViewModel {
	readonly ctx: RunsViewCtx
	readonly runsFullView: boolean
	readonly inDetail: boolean
	readonly runsState: ResultState<readonly WorkflowRun[]>
	readonly detailState: ResultState<WorkflowRunDetails> | null
	readonly runsSelection: number
	readonly detailSelection: number
	readonly detailRows: readonly RunDetailRow[]
	// Click-to-select then act on a row (run row → open run; detail row → no-op extra).
	readonly selectRow: (index: number) => void
	readonly activateRow: (index: number) => void
}

export interface RepositoryRunsViewOptions {
	readonly repository: string | null
	readonly active: boolean
	readonly onClose: () => void
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
}

/**
 * Owns all runs-view atom state + navigation. Self-contained so the runs feature
 * lives in one module rather than threaded through the app-shell God-hook. Reads
 * the runs/detail family atoms (which auto-suspend) and exposes the keymap ctx
 * plus the data the pane renders.
 */
export const useRunsView = (
	selectedPullRequest: PullRequestItem | null,
	halfPage: number,
	flashNotice: (message: string) => void,
	repositoryOptions?: RepositoryRunsViewOptions,
): RunsViewModel => {
	const registry = useContext(RegistryContext)
	const repositoryMode = repositoryOptions !== undefined
	const closeRepositoryView = repositoryOptions?.onClose
	const switchRepositorySurface = repositoryOptions?.switchWorkspaceSurface
	const cycleRepositorySurface = repositoryOptions?.cycleWorkspaceSurface
	const [pullRequestRunsFullView, setPullRequestRunsFullView] = useAtom(runsFullViewAtom)
	const [, setSelectedRunId] = useAtom(repositoryMode ? repositorySelectedRunIdAtom : selectedRunIdAtom)
	const [, setRunsSelection] = useAtom(repositoryMode ? repositoryRunsListSelectionAtom : runsListSelectionAtom)
	const [, setDetailSelection] = useAtom(repositoryMode ? repositoryRunDetailSelectionAtom : runDetailSelectionAtom)
	const openUrl = useAtomSet(openUrlAtom, { mode: "promise" })
	const rerunWorkflowRun = useAtomSet(rerunWorkflowRunAtom, { mode: "promise" })
	const cancelWorkflowRun = useAtomSet(cancelWorkflowRunAtom, { mode: "promise" })
	const [actionPending, setActionPending] = createSignal(false)
	const selectedRepositoryLive = useAtomValueSolid(() => selectedRepositoryAtom)
	const selectedPullRequestLive = useAtomValueSolid(() => selectedPullRequestAtom)
	const workspaceSurfaceLive = useAtomValueSolid(() => workspaceSurfaceAtom)
	const selectedRunIdLive = useAtomValueSolid(() => (repositoryMode ? repositorySelectedRunIdAtom : selectedRunIdAtom))
	const runsSelectionLive = useAtomValueSolid(() => (repositoryMode ? repositoryRunsListSelectionAtom : runsListSelectionAtom))
	const detailSelectionLive = useAtomValueSolid(() => (repositoryMode ? repositoryRunDetailSelectionAtom : runDetailSelectionAtom))
	const pullRequestRunsResultLive = useAtomValueSolid(() => {
		const pullRequest = selectedPullRequestLive()
		return pullRequestRunsFor(!repositoryMode && pullRequest ? runsKey(pullRequest) : "\u0000\u0000")
	})
	const repositoryRunsResultLive = useAtomValueSolid(() => repositoryWorkflowRunsFor(repositoryMode ? (selectedRepositoryLive() ?? "") : ""))
	const detailResultLive = useAtomValueSolid(() => {
		const repository = repositoryMode ? selectedRepositoryLive() : (selectedPullRequestLive()?.repository ?? null)
		const runId = selectedRunIdLive()
		return workflowRunDetailsFor(repository && runId !== null ? runDetailKey(repository, runId) : "\u0000\u0000")
	})

	const repository = () => (repositoryMode ? selectedRepositoryLive() : (selectedPullRequestLive()?.repository ?? null))
	const runsResultLive = () => (repositoryMode ? repositoryRunsResultLive() : pullRequestRunsResultLive())
	const runsStateLive = () => toState(runsResultLive())
	const runsLive = () => {
		const state = runsStateLive()
		return state.status === "ready" ? state.value : []
	}
	const inDetailLive = () => selectedRunIdLive() !== null
	const detailStateLive = () => {
		const repositoryName = repository()
		const runId = selectedRunIdLive()
		return repositoryName && runId !== null ? toState(detailResultLive()) : null
	}
	const detailRowsLive = () => {
		const state = detailStateLive()
		const detailRun = state?.status === "ready" ? state.value : null
		return detailRun ? flattenRunRows(detailRun) : []
	}

	createEffect(() => {
		if (!repositoryMode) return
		selectedRepositoryLive()
		setSelectedRunId(null)
		setRunsSelection(0)
		setDetailSelection(0)
	})

	const closeRunsView = () => {
		if (repositoryMode) closeRepositoryView?.()
		else setPullRequestRunsFullView(false)
		setSelectedRunId(null)
	}

	const backToList = () => {
		const runId = selectedRunIdLive()
		if (runId !== null) {
			const selectedIndex = runsLive().findIndex((run) => run.id === runId)
			if (selectedIndex >= 0) setRunsSelection(selectedIndex)
		}
		setSelectedRunId(null)
		setDetailSelection(0)
	}

	const handleEscape = () => {
		if (inDetailLive()) backToList()
		else closeRunsView()
	}

	const moveSelection = (delta: number) => {
		if (inDetailLive()) setDetailSelection((current) => clamp(current + delta, detailRowsLive().length - 1))
		else setRunsSelection((current) => clamp(current + delta, runsLive().length - 1))
	}

	const moveSelectionToBoundary = (boundary: "first" | "last") => {
		if (inDetailLive()) setDetailSelection(boundary === "first" ? 0 : Math.max(0, detailRowsLive().length - 1))
		else setRunsSelection(boundary === "first" ? 0 : Math.max(0, runsLive().length - 1))
	}

	const openRunAt = (index: number) => {
		const run = runsLive()[index]
		if (!run) return
		setSelectedRunId(run.id)
		setDetailSelection(0)
	}

	const openStepLogAt = (index: number) => {
		const row = detailRowsLive()[index]
		const state = detailStateLive()
		const detailRun = state?.status === "ready" ? state.value : null
		const url = row?.kind === "step" ? row.job.url : detailRun?.url
		if (url) void openUrl(url)
	}

	const openSelected = () => {
		if (inDetailLive()) openStepLogAt(detailSelectionLive())
		else openRunAt(runsSelectionLive())
	}

	const jumpFailure = (direction: 1 | -1) => {
		if (!inDetailLive()) return
		const failures = failureRowIndices(detailRowsLive())
		if (failures.length === 0) return
		const current = detailSelectionLive()
		const next =
			direction === 1 ? (failures.find((index) => index > current) ?? failures[0]!) : ([...failures].reverse().find((index) => index < current) ?? failures[failures.length - 1]!)
		setDetailSelection(next)
	}

	const openInBrowser = () => {
		const state = detailStateLive()
		const detailRun = state?.status === "ready" ? state.value : null
		const url = inDetailLive() ? detailRun?.url : runsLive()[runsSelectionLive()]?.url
		if (url) void openUrl(url)
	}

	const selectRow = (index: number) => {
		if (inDetailLive()) setDetailSelection(clamp(index, detailRowsLive().length - 1))
		else setRunsSelection(clamp(index, runsLive().length - 1))
	}

	const activateRow = (index: number) => {
		if (inDetailLive()) openStepLogAt(index)
		else openRunAt(index)
	}

	const refresh = () => {
		const repositoryName = repository()
		const pullRequest = selectedPullRequestLive()
		const runId = selectedRunIdLive()
		if (repositoryMode && repositoryName) registry.refresh(repositoryWorkflowRunsFor(repositoryName))
		else if (pullRequest) registry.refresh(pullRequestRunsFor(runsKey(pullRequest)))
		if (repositoryName && runId !== null) registry.refresh(workflowRunDetailsFor(runDetailKey(repositoryName, runId)))
	}

	createEffect(() => {
		const active = repositoryMode ? workspaceSurfaceLive() === "actions" : pullRequestRunsFullView
		const state = runsStateLive()
		const runs = runsLive()
		if (!active || state.status !== "ready" || !runs.some((run) => run.status !== "completed")) return
		const timeout = globalThis.setTimeout(refresh, 5_000)
		onCleanup(() => globalThis.clearTimeout(timeout))
	})

	const rerun = (failedOnly: boolean) => {
		const repositoryName = repository()
		const state = detailStateLive()
		const detailRun = state?.status === "ready" ? state.value : null
		if (!repositoryName || !detailRun || actionPending()) return
		if (!canRerunRun(detailRun)) {
			flashNotice("Only completed workflow runs can be rerun")
			return
		}
		if (failedOnly && !canRerunFailedJobs(detailRun)) {
			flashNotice("This run has no failed jobs to rerun")
			return
		}

		setActionPending(true)
		flashNotice(failedOnly ? "Rerunning failed jobs" : "Rerunning workflow")
		void rerunWorkflowRun({ repository: repositoryName, runId: detailRun.id, failedOnly })
			.then(() => {
				refresh()
				flashNotice(failedOnly ? "Failed jobs queued" : "Workflow rerun queued")
			})
			.catch((error) => flashNotice(errorMessage(error)))
			.finally(() => setActionPending(false))
	}

	const cancel = () => {
		const repositoryName = repository()
		const state = detailStateLive()
		const detailRun = state?.status === "ready" ? state.value : null
		if (!repositoryName || !detailRun || actionPending()) return
		if (!canCancelRun(detailRun)) {
			flashNotice("Only queued or in-progress workflow runs can be cancelled")
			return
		}

		setActionPending(true)
		flashNotice("Cancelling workflow run")
		void cancelWorkflowRun({ repository: repositoryName, runId: detailRun.id })
			.then(() => {
				refresh()
				flashNotice("Workflow run cancelled")
			})
			.catch((error) => flashNotice(errorMessage(error)))
			.finally(() => setActionPending(false))
	}

	const ctx: RunsViewCtx = {
		halfPage,
		get inDetail() {
			return inDetailLive()
		},
		handleEscape,
		moveSelection,
		moveSelectionToBoundary,
		openSelected,
		nextFailure: () => jumpFailure(1),
		previousFailure: () => jumpFailure(-1),
		refresh,
		rerun,
		cancel,
		openInBrowser,
		repositorySurface: repositoryMode,
		switchWorkspaceSurface: repositoryMode && switchRepositorySurface ? switchRepositorySurface : () => undefined,
		cycleWorkspaceSurface: repositoryMode && cycleRepositorySurface ? cycleRepositorySurface : () => undefined,
	}

	return {
		ctx,
		get runsFullView() {
			return repositoryMode ? workspaceSurfaceLive() === "actions" : pullRequestRunsFullView
		},
		get inDetail() {
			return inDetailLive()
		},
		get runsState() {
			return runsStateLive()
		},
		get detailState() {
			return detailStateLive()
		},
		get runsSelection() {
			return clamp(runsSelectionLive(), runsLive().length - 1)
		},
		get detailSelection() {
			return clamp(detailSelectionLive(), detailRowsLive().length - 1)
		},
		get detailRows() {
			return detailRowsLive()
		},
		selectRow,
		activateRow,
	}
}
