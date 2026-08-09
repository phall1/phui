// === Stars keymap layer ===
//
// Fork-owned for the same reason as src/projects/keymap.ts and
// src/notifications/keymap.ts: a rename under src/keymap/ should break loudly
// in one fork-owned file rather than silently orphan a fork-only surface.

import { context } from "@phui/keymap"
import { countedVerticalBindings } from "../keymap/helpers.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"

export interface StarsViewHandle {
	readonly hasSelection: boolean
	readonly moveSelection: (delta: number) => void
	readonly moveSelectionToBoundary: (boundary: "first" | "last") => void
	readonly openSelected: () => void
	readonly openSelectedInBrowser: () => void
	readonly unstarSelected: () => void
	readonly cycleSort: () => void
	readonly refresh: () => void
	readonly startFilter: () => void
}

/** The workspace-navigation slice of `ListNavCtx` this layer reuses. */
export interface StarsNavCtx {
	readonly halfPage: number
	readonly activeSurface: WorkspaceSurface
	readonly surfaces: readonly WorkspaceSurface[]
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
}

let mounted: StarsViewHandle | null = null

export const setStarsViewHandle = (handle: StarsViewHandle): void => {
	mounted = handle
}

/** Identity-guarded; see the note on `clearProjectsViewHandle`. */
export const clearStarsViewHandle = (handle: StarsViewHandle): void => {
	if (mounted === handle) mounted = null
}

export const starsViewHandle = (): StarsViewHandle | null => mounted

export interface StarsViewCtx extends StarsViewHandle {
	readonly halfPage: number
	readonly surfaces: readonly WorkspaceSurface[]
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
}

export const buildStarsViewCtx = (nav: StarsNavCtx, handle: StarsViewHandle | null = mounted): StarsViewCtx | null => {
	if (nav.activeSurface !== "stars" || handle === null) return null
	return {
		...handle,
		halfPage: nav.halfPage,
		surfaces: nav.surfaces,
		switchWorkspaceSurface: nav.switchWorkspaceSurface,
		cycleWorkspaceSurface: nav.cycleWorkspaceSurface,
	}
}

const Stars = context<StarsViewCtx>()

const surfaceAt = (s: StarsViewCtx, index: number) => s.surfaces[index] ?? null
const goToSurfaceAt = (s: StarsViewCtx, index: number) => {
	const surface = surfaceAt(s, index)
	if (surface) s.switchWorkspaceSurface(surface)
}
const hasSelection = (s: StarsViewCtx) => (s.hasSelection ? true : "Nothing selected.")

export const starsViewKeymap = Stars(
	{ id: "stars.escape", title: "Back to repositories", keys: ["escape"], run: (s) => s.switchWorkspaceSurface("repos") },
	{ id: "stars.filter", title: "Filter starred repositories", keys: ["/"], run: (s) => s.startFilter() },
	{ id: "stars.open", title: "Open repository in phui", keys: ["return", "right", "l"], enabled: hasSelection, run: (s) => s.openSelected() },
	{ id: "stars.open-browser", title: "Open repository in browser", keys: ["o"], enabled: hasSelection, run: (s) => s.openSelectedInBrowser() },
	{ id: "stars.unstar", title: "Unstar repository", keys: ["shift+u"], enabled: hasSelection, run: (s) => s.unstarSelected() },
	{ id: "stars.sort", title: "Change sort", keys: ["s"], run: (s) => s.cycleSort() },
	{ id: "stars.refresh", title: "Refresh stars", keys: ["r"], run: (s) => s.refresh() },

	{ id: "stars.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.moveSelection(-s.halfPage) },
	{ id: "stars.half-down", title: "Half page down", keys: ["pagedown", "ctrl+d"], run: (s) => s.moveSelection(s.halfPage) },

	...countedVerticalBindings<StarsViewCtx>((s, delta) => s.moveSelection(delta)),

	{ id: "stars.up", title: "Up", keys: ["up", "k"], run: (s) => s.moveSelection(-1) },
	{ id: "stars.down", title: "Down", keys: ["down", "j"], run: (s) => s.moveSelection(1) },
	{ id: "stars.first", title: "First", keys: ["g g"], run: (s) => s.moveSelectionToBoundary("first") },
	{ id: "stars.last", title: "Last", keys: ["shift+g"], run: (s) => s.moveSelectionToBoundary("last") },

	{ id: "stars.first-surface", title: "First surface", keys: ["1"], run: (s) => goToSurfaceAt(s, 0) },
	{ id: "stars.second-surface", title: "Second surface", keys: ["2"], run: (s) => goToSurfaceAt(s, 1) },
	{ id: "stars.third-surface", title: "Third surface", keys: ["3"], run: (s) => goToSurfaceAt(s, 2) },
	{ id: "stars.next-tab", title: "Next surface", keys: ["tab"], run: (s) => s.cycleWorkspaceSurface(1) },
	{ id: "stars.previous-tab", title: "Previous surface", keys: ["shift+tab"], run: (s) => s.cycleWorkspaceSurface(-1) },
	{ id: "stars.go-home", title: "Go home", keys: ["g h", "g r"], run: (s) => s.switchWorkspaceSurface("repos") },
	{ id: "stars.go-pulls", title: "Go to pull requests", keys: ["g p"], run: (s) => s.switchWorkspaceSurface("pullRequests") },
	{ id: "stars.go-issues", title: "Go to issues", keys: ["g i"], run: (s) => s.switchWorkspaceSurface("issues") },
	{ id: "stars.go-inbox", title: "Go to inbox", keys: ["g n"], run: (s) => s.switchWorkspaceSurface("notifications") },
)
