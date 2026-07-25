import { context } from "@phui/keymap"
import { countedVerticalBindings } from "./helpers.ts"
import type { WorkspaceSurface } from "../workspaceSurfaces.ts"

// The runs view has two sub-modes that share one keymap layer:
//   - list (A): no run selected — `enter` opens a run, ↑↓ walks runs
//   - detail (B): a run selected — `enter` expands a step log, ↑↓ walks job/step rows
// `inDetail` switches which sub-mode the shared keys act on.

export interface RunsViewCtx {
	readonly halfPage: number
	readonly inDetail: boolean
	readonly handleEscape: () => void // back from detail → list, or close runs view
	readonly moveSelection: (delta: number) => void
	readonly moveSelectionToBoundary: (boundary: "first" | "last") => void
	readonly openSelected: () => void // list: open run; detail: open the selected job on GitHub
	readonly nextFailure: () => void
	readonly previousFailure: () => void
	readonly refresh: () => void
	readonly rerun: (failedOnly: boolean) => void
	readonly cancel: () => void
	readonly openInBrowser: () => void
	readonly repositorySurface: boolean
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
}

const Runs = context<RunsViewCtx>()

export const runsViewKeymap = Runs(
	{ id: "runs.escape", title: "Back / close runs", keys: ["escape"], run: (s) => s.handleEscape() },
	{ id: "runs.open", title: "Open run / job", keys: ["return", "right", "l"], run: (s) => s.openSelected() },

	{ id: "runs.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.moveSelection(-s.halfPage) },
	{ id: "runs.half-down", title: "Half page down", keys: ["pagedown", "ctrl+d"], run: (s) => s.moveSelection(s.halfPage) },

	...countedVerticalBindings<RunsViewCtx>((s, delta) => s.moveSelection(delta)),

	{ id: "runs.up", title: "Up", keys: ["up", "k"], run: (s) => s.moveSelection(-1) },
	{ id: "runs.down", title: "Down", keys: ["down", "j"], run: (s) => s.moveSelection(1) },

	{ id: "runs.next-failure", title: "Next failure", keys: ["n"], run: (s) => s.nextFailure() },
	{ id: "runs.previous-failure", title: "Previous failure", keys: ["p"], run: (s) => s.previousFailure() },

	{ id: "runs.first", title: "First", keys: ["g g"], run: (s) => s.moveSelectionToBoundary("first") },
	{ id: "runs.last", title: "Last", keys: ["shift+g"], run: (s) => s.moveSelectionToBoundary("last") },

	{ id: "runs.refresh", title: "Refresh runs", keys: ["r"], run: (s) => s.refresh() },
	{ id: "runs.rerun", title: "Re-run workflow", keys: ["shift+r"], when: (s) => s.inDetail, run: (s) => s.rerun(false) },
	{ id: "runs.rerun-failed", title: "Re-run failed jobs", keys: ["shift+f"], when: (s) => s.inDetail, run: (s) => s.rerun(true) },
	{ id: "runs.cancel", title: "Cancel workflow run", keys: ["x"], when: (s) => s.inDetail, run: (s) => s.cancel() },
	{ id: "runs.open-browser", title: "Open in browser", keys: ["o"], run: (s) => s.openInBrowser() },
	{ id: "actions.next-tab", title: "Next surface", keys: ["tab"], when: (s) => s.repositorySurface, run: (s) => s.cycleWorkspaceSurface(1) },
	{ id: "actions.previous-tab", title: "Previous surface", keys: ["shift+tab"], when: (s) => s.repositorySurface, run: (s) => s.cycleWorkspaceSurface(-1) },
	{ id: "actions.go-pulls", title: "Go to pull requests", keys: ["g p"], when: (s) => s.repositorySurface, run: (s) => s.switchWorkspaceSurface("pullRequests") },
	{ id: "actions.go-issues", title: "Go to issues", keys: ["g i"], when: (s) => s.repositorySurface, run: (s) => s.switchWorkspaceSurface("issues") },
)
