// === Projects keymap layer ===
//
// Fork-owned, and deliberately NOT under `src/keymap/`: upstream restructures
// that directory (the whole layer moved once already, `useScopedBindings` →
// `@phui/keymap`), and a rename there would silently orphan fork-only files
// sitting in it — a clean merge that fails to typecheck. Living here means a
// rename produces a loud unresolved import in one fork-owned file instead.
//
// The Projects surface is a linter, not an inventory: the body is findings
// grouped by check, and `a` flips to the full project list. The layer owns its
// own cursor keys because `listNav` is suppressed while Projects is active —
// otherwise j/k would silently drive the pull-request cursor (useAppKeymap's
// `visibleCount`/`setSelected` fall through to the PR list for any surface it
// does not recognise). It also re-binds the workspace-nav keys `listNav`
// normally provides (1-3, tab, `g` jumps) for the same reason.
//
// Why a module-level handle instead of a field on `AppCtx`:
//
// Every other keymap layer gets its ctx threaded through `buildAppCtx` +
// `useAppKeymap`. Adding `projects` there would mean editing both of those
// upstream files (plus `useAppShell`) for a fork-only surface, which is exactly
// the rebase cost this feature is trying not to pay. So instead the mounted
// Projects view publishes its imperative actions here, and `appKeymap` projects
// them alongside the workspace-navigation bits it can already reach through
// `AppCtx["listNav"]`.
//
// The handle is null whenever the surface is unmounted, which deactivates the
// whole layer (`Keymap.scope` accepts `C | null`) rather than dispatching into
// a stale view. All actual state still lives in atoms (./atoms.ts); this is a
// function table, not a state store.

import { context } from "@phui/keymap"
import { countedVerticalBindings } from "../keymap/helpers.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"

export interface ProjectsViewHandle {
	readonly hasSelection: boolean
	readonly moveSelection: (delta: number) => void
	readonly moveSelectionToBoundary: (boundary: "first" | "last") => void
	readonly openSelected: () => void
	readonly toggleInventory: () => void
	readonly rescan: () => void
}

/** The workspace-navigation slice of `ListNavCtx` this layer reuses. */
export interface ProjectsNavCtx {
	readonly halfPage: number
	readonly activeSurface: WorkspaceSurface
	readonly surfaces: readonly WorkspaceSurface[]
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
}

let mounted: ProjectsViewHandle | null = null

export const setProjectsViewHandle = (handle: ProjectsViewHandle): void => {
	mounted = handle
}

/**
 * Unmount teardown. Identity-guarded on purpose: two Apps can overlap in one
 * process (every `test/*.test.tsx` mounts several per file), and an
 * unconditional clear would let the first view's cleanup null out the second
 * view's handle — deactivating the layer while `listNav` is also suppressed,
 * i.e. a Projects surface that ignores the keyboard entirely, silently.
 */
export const clearProjectsViewHandle = (handle: ProjectsViewHandle): void => {
	if (mounted === handle) mounted = null
}

export const projectsViewHandle = (): ProjectsViewHandle | null => mounted

export interface ProjectsViewCtx {
	readonly halfPage: number
	readonly hasSelection: boolean
	readonly surfaces: readonly WorkspaceSurface[]
	readonly moveSelection: (delta: number) => void
	readonly moveSelectionToBoundary: (boundary: "first" | "last") => void
	readonly openSelected: () => void
	readonly toggleInventory: () => void
	readonly rescan: () => void
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
}

/**
 * Returns the Projects layer ctx, or null when the layer should be inactive
 * (a different surface is showing, or the view is not mounted). `handle` is a
 * parameter so tests can drive the layer without rendering the surface.
 */
export const buildProjectsViewCtx = (nav: ProjectsNavCtx, handle: ProjectsViewHandle | null = mounted): ProjectsViewCtx | null => {
	if (nav.activeSurface !== "projects" || handle === null) return null
	return {
		halfPage: nav.halfPage,
		hasSelection: handle.hasSelection,
		surfaces: nav.surfaces,
		moveSelection: handle.moveSelection,
		moveSelectionToBoundary: handle.moveSelectionToBoundary,
		openSelected: handle.openSelected,
		toggleInventory: handle.toggleInventory,
		rescan: handle.rescan,
		switchWorkspaceSurface: nav.switchWorkspaceSurface,
		cycleWorkspaceSurface: nav.cycleWorkspaceSurface,
	}
}

const Projects = context<ProjectsViewCtx>()

const surfaceAt = (s: ProjectsViewCtx, index: number) => s.surfaces[index] ?? null
const goToSurfaceAt = (s: ProjectsViewCtx, index: number) => {
	const surface = surfaceAt(s, index)
	if (surface) s.switchWorkspaceSurface(surface)
}
const hasSelection = (s: ProjectsViewCtx) => (s.hasSelection ? true : "Nothing to open.")

// No `4` binding here: `workspace.fourth` in src/keymap/all.ts is always on and
// already switches to Projects, so a second one would only duplicate the entry
// in the command palette.
export const projectsViewKeymap = Projects(
	{ id: "projects.escape", title: "Back to repositories", keys: ["escape"], run: (s) => s.switchWorkspaceSurface("repos") },
	{ id: "projects.open", title: "Open selected", keys: ["return", "right", "l", "o"], enabled: hasSelection, run: (s) => s.openSelected() },
	{ id: "projects.inventory", title: "Toggle all projects", keys: ["a"], run: (s) => s.toggleInventory() },
	{ id: "projects.rescan", title: "Rescan projects", keys: ["r"], run: (s) => s.rescan() },

	{ id: "projects.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.moveSelection(-s.halfPage) },
	{ id: "projects.half-down", title: "Half page down", keys: ["pagedown", "ctrl+d"], run: (s) => s.moveSelection(s.halfPage) },

	...countedVerticalBindings<ProjectsViewCtx>((s, delta) => s.moveSelection(delta)),

	{ id: "projects.up", title: "Up", keys: ["up", "k"], run: (s) => s.moveSelection(-1) },
	{ id: "projects.down", title: "Down", keys: ["down", "j"], run: (s) => s.moveSelection(1) },
	{ id: "projects.first", title: "First", keys: ["g g"], run: (s) => s.moveSelectionToBoundary("first") },
	{ id: "projects.last", title: "Last", keys: ["shift+g"], run: (s) => s.moveSelectionToBoundary("last") },

	{ id: "projects.first-surface", title: "First surface", keys: ["1"], run: (s) => goToSurfaceAt(s, 0) },
	{ id: "projects.second-surface", title: "Second surface", keys: ["2"], run: (s) => goToSurfaceAt(s, 1) },
	{ id: "projects.third-surface", title: "Third surface", keys: ["3"], run: (s) => goToSurfaceAt(s, 2) },
	{ id: "projects.next-tab", title: "Next surface", keys: ["tab"], run: (s) => s.cycleWorkspaceSurface(1) },
	{ id: "projects.previous-tab", title: "Previous surface", keys: ["shift+tab"], run: (s) => s.cycleWorkspaceSurface(-1) },
	{ id: "projects.go-home", title: "Go home", keys: ["g h", "g r"], run: (s) => s.switchWorkspaceSurface("repos") },
	{ id: "projects.go-pulls", title: "Go to pull requests", keys: ["g p"], run: (s) => s.switchWorkspaceSurface("pullRequests") },
	{ id: "projects.go-issues", title: "Go to issues", keys: ["g i"], run: (s) => s.switchWorkspaceSurface("issues") },
)
