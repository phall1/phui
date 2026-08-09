// === Inbox keymap layer ===
//
// Fork-owned, and deliberately NOT under `src/keymap/` — same reasoning as
// `src/projects/keymap.ts`: upstream restructures that directory, and a rename
// there would silently orphan fork-only files sitting in it. Living here means
// a rename produces a loud unresolved import in one fork-owned file instead.
//
// Like Projects, the mounted view publishes an imperative handle here and
// `appKeymap` projects it alongside the workspace-navigation bits it can reach
// through `AppCtx["listNav"]`, so `listNav` can stay suppressed while the Inbox
// owns j/k.

import { context } from "@phui/keymap"
import { countedVerticalBindings } from "../keymap/helpers.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"

export interface InboxViewHandle {
	readonly hasSelection: boolean
	readonly canOpenInApp: boolean
	readonly unreadOnly: boolean
	readonly participatingOnly: boolean
	readonly moveSelection: (delta: number) => void
	readonly moveSelectionToBoundary: (boundary: "first" | "last") => void
	readonly openSelected: () => void
	readonly openSelectedInBrowser: () => void
	readonly markSelectedDone: () => void
	readonly toggleSelectedRead: () => void
	readonly unsubscribeSelected: () => void
	readonly markAllRead: () => void
	readonly toggleUnreadOnly: () => void
	readonly toggleParticipating: () => void
	readonly refresh: () => void
}

/** The workspace-navigation slice of `ListNavCtx` this layer reuses. */
export interface InboxNavCtx {
	readonly halfPage: number
	readonly activeSurface: WorkspaceSurface
	readonly surfaces: readonly WorkspaceSurface[]
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
}

let mounted: InboxViewHandle | null = null

export const setInboxViewHandle = (handle: InboxViewHandle): void => {
	mounted = handle
}

/** Identity-guarded; see the note on `clearProjectsViewHandle`. */
export const clearInboxViewHandle = (handle: InboxViewHandle): void => {
	if (mounted === handle) mounted = null
}

export const inboxViewHandle = (): InboxViewHandle | null => mounted

export interface InboxViewCtx extends InboxViewHandle {
	readonly halfPage: number
	readonly surfaces: readonly WorkspaceSurface[]
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
}

/**
 * Returns the Inbox layer ctx, or null when the layer should be inactive (a
 * different surface is showing, or the view is not mounted). `handle` is a
 * parameter so tests can drive the layer without rendering the surface.
 */
export const buildInboxViewCtx = (nav: InboxNavCtx, handle: InboxViewHandle | null = mounted): InboxViewCtx | null => {
	if (nav.activeSurface !== "notifications" || handle === null) return null
	return {
		...handle,
		halfPage: nav.halfPage,
		surfaces: nav.surfaces,
		switchWorkspaceSurface: nav.switchWorkspaceSurface,
		cycleWorkspaceSurface: nav.cycleWorkspaceSurface,
	}
}

const Inbox = context<InboxViewCtx>()

const surfaceAt = (s: InboxViewCtx, index: number) => s.surfaces[index] ?? null
const goToSurfaceAt = (s: InboxViewCtx, index: number) => {
	const surface = surfaceAt(s, index)
	if (surface) s.switchWorkspaceSurface(surface)
}
const hasSelection = (s: InboxViewCtx) => (s.hasSelection ? true : "The inbox is empty.")

// No `5` binding here: `workspace.fifth` in src/keymap/all.ts is always on and
// already switches to the Inbox, so a second one would only duplicate the entry
// in the command palette.
export const inboxViewKeymap = Inbox(
	{ id: "inbox.escape", title: "Back to repositories", keys: ["escape"], run: (s) => s.switchWorkspaceSurface("repos") },
	{ id: "inbox.open", title: "Open notification", keys: ["return", "right", "l"], enabled: hasSelection, run: (s) => s.openSelected() },
	{ id: "inbox.open-browser", title: "Open notification in browser", keys: ["o"], enabled: hasSelection, run: (s) => s.openSelectedInBrowser() },
	{ id: "inbox.done", title: "Mark done", keys: ["d"], enabled: hasSelection, run: (s) => s.markSelectedDone() },
	{ id: "inbox.toggle-read", title: "Toggle read", keys: ["m"], enabled: hasSelection, run: (s) => s.toggleSelectedRead() },
	{ id: "inbox.unsubscribe", title: "Unsubscribe from thread", keys: ["shift+u"], enabled: hasSelection, run: (s) => s.unsubscribeSelected() },
	{ id: "inbox.mark-all-read", title: "Mark everything read", keys: ["shift+a"], run: (s) => s.markAllRead() },
	{ id: "inbox.toggle-unread-only", title: "Toggle unread only", keys: ["u"], run: (s) => s.toggleUnreadOnly() },
	{ id: "inbox.toggle-participating", title: "Toggle participating only", keys: ["p"], run: (s) => s.toggleParticipating() },
	{ id: "inbox.refresh", title: "Refresh inbox", keys: ["r"], run: (s) => s.refresh() },

	{ id: "inbox.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.moveSelection(-s.halfPage) },
	{ id: "inbox.half-down", title: "Half page down", keys: ["pagedown", "ctrl+d"], run: (s) => s.moveSelection(s.halfPage) },

	...countedVerticalBindings<InboxViewCtx>((s, delta) => s.moveSelection(delta)),

	{ id: "inbox.up", title: "Up", keys: ["up", "k"], run: (s) => s.moveSelection(-1) },
	{ id: "inbox.down", title: "Down", keys: ["down", "j"], run: (s) => s.moveSelection(1) },
	{ id: "inbox.first", title: "First", keys: ["g g"], run: (s) => s.moveSelectionToBoundary("first") },
	{ id: "inbox.last", title: "Last", keys: ["shift+g"], run: (s) => s.moveSelectionToBoundary("last") },

	{ id: "inbox.first-surface", title: "First surface", keys: ["1"], run: (s) => goToSurfaceAt(s, 0) },
	{ id: "inbox.second-surface", title: "Second surface", keys: ["2"], run: (s) => goToSurfaceAt(s, 1) },
	{ id: "inbox.third-surface", title: "Third surface", keys: ["3"], run: (s) => goToSurfaceAt(s, 2) },
	{ id: "inbox.fourth-surface", title: "Fourth surface", keys: ["4"], run: (s) => goToSurfaceAt(s, 3) },
	{ id: "inbox.next-tab", title: "Next surface", keys: ["tab"], run: (s) => s.cycleWorkspaceSurface(1) },
	{ id: "inbox.previous-tab", title: "Previous surface", keys: ["shift+tab"], run: (s) => s.cycleWorkspaceSurface(-1) },
	{ id: "inbox.go-home", title: "Go home", keys: ["g h", "g r"], run: (s) => s.switchWorkspaceSurface("repos") },
	{ id: "inbox.go-pulls", title: "Go to pull requests", keys: ["g p"], run: (s) => s.switchWorkspaceSurface("pullRequests") },
	{ id: "inbox.go-issues", title: "Go to issues", keys: ["g i"], run: (s) => s.switchWorkspaceSurface("issues") },
	{ id: "inbox.go-projects", title: "Go to projects", keys: ["g o"], run: (s) => s.switchWorkspaceSurface("projects") },
)
