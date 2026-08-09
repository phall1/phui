import { context } from "@phui/keymap"
import { changedFilesModalKeymap, type ChangedFilesModalCtx } from "./changedFilesModal.ts"
import { closeModalKeymap, type CloseModalCtx } from "./closeModal.ts"
import { commandPaletteKeymap, type CommandPaletteCtx } from "./commandPalette.ts"
import { commentModalKeymap, type CommentModalCtx } from "./commentModal.ts"
import { commentsViewKeymap, type CommentsViewCtx } from "./commentsView.ts"
import { commentThreadModalKeymap, type CommentThreadModalCtx } from "./commentThreadModal.ts"
import { deleteCommentModalKeymap, type DeleteCommentModalCtx } from "./deleteCommentModal.ts"
import { detailViewKeymap, type DetailViewCtx } from "./detailView.ts"
import { diffViewKeymap, type DiffViewCtx } from "./diffView.ts"
import { filterModalKeymap, type FilterModalCtx } from "./filterModal.ts"
import { filterModeKeymap, type FilterModeCtx } from "./filterMode.ts"
import { labelModalKeymap, type LabelModalCtx } from "./labelModal.ts"
import { listNavKeymap, type ListNavCtx } from "./listNav.ts"
import { mergeModalKeymap, type MergeModalCtx } from "./mergeModal.ts"
import { openRepositoryModalKeymap, type OpenRepositoryModalCtx } from "./openRepositoryModal.ts"
import { buildInboxViewCtx, inboxViewKeymap } from "../notifications/keymap.js"
import { buildProjectsViewCtx, projectsViewKeymap } from "../projects/keymap.js"
import { buildStarsViewCtx, starsViewKeymap } from "../stars/keymap.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import { pullRequestStateModalKeymap, type PullRequestStateModalCtx } from "./pullRequestStateModal.ts"
import { runsViewKeymap, type RunsViewCtx } from "./runsView.ts"
import { submitReviewModalKeymap, type SubmitReviewModalCtx } from "./submitReviewModal.ts"
import { themeModalKeymap, type ThemeModalCtx } from "./themeModal.ts"

export interface AppCtx {
	// Active flags
	readonly closeModalActive: boolean
	readonly pullRequestStateModalActive: boolean
	readonly mergeModalActive: boolean
	readonly commentThreadModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly filterModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly labelModalActive: boolean
	readonly themeModalActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly commentModalActive: boolean
	readonly deleteCommentModalActive: boolean
	readonly commandPaletteActive: boolean
	readonly filterMode: boolean
	readonly diffFullView: boolean
	readonly runsFullView: boolean
	readonly detailFullView: boolean
	readonly commentsViewActive: boolean

	// True whenever a modal/mode swallows raw text input (so q-quit, etc. are
	// disabled inside text-editing contexts).
	readonly textInputActive: boolean

	// Per-layer narrow contexts
	readonly closeModal: CloseModalCtx
	readonly pullRequestStateModal: PullRequestStateModalCtx
	readonly mergeModal: MergeModalCtx
	readonly commentThreadModal: CommentThreadModalCtx
	readonly changedFilesModal: ChangedFilesModalCtx
	readonly filterModal: FilterModalCtx
	readonly submitReviewModal: SubmitReviewModalCtx
	readonly labelModal: LabelModalCtx
	readonly themeModal: ThemeModalCtx
	readonly openRepositoryModal: OpenRepositoryModalCtx
	readonly commentModal: CommentModalCtx
	readonly deleteCommentModal: DeleteCommentModalCtx
	readonly commandPalette: CommandPaletteCtx
	readonly filterModeCtx: FilterModeCtx
	readonly diff: DiffViewCtx
	readonly runs: RunsViewCtx
	readonly detail: DetailViewCtx
	readonly commentsView: CommentsViewCtx
	readonly listNav: ListNavCtx

	// Always-on / app-level
	readonly openCommandPalette: () => void
	readonly handleQuitOrClose: () => void
}

const App = context<AppCtx>()

const modalActive = (a: AppCtx): boolean =>
	a.closeModalActive ||
	a.pullRequestStateModalActive ||
	a.mergeModalActive ||
	a.commentThreadModalActive ||
	a.changedFilesModalActive ||
	a.filterModalActive ||
	a.submitReviewModalActive ||
	a.labelModalActive ||
	a.themeModalActive ||
	a.openRepositoryModalActive ||
	a.commentModalActive ||
	a.deleteCommentModalActive ||
	a.commandPaletteActive

const inListMode = (a: AppCtx): boolean => !modalActive(a) && !a.filterMode && !a.diffFullView && !a.runsFullView && !a.detailFullView && !a.commentsViewActive

/**
 * Surfaces that bring their own keymap layer and therefore suppress `listNav`.
 * `listNav`'s cursor keys fall through to the pull-request list for any surface
 * it does not recognise, so a fork-owned surface left out of this set would
 * silently drive the wrong selection with j/k.
 */
const FORK_OWNED_SURFACES: ReadonlySet<WorkspaceSurface> = new Set<WorkspaceSurface>(["projects", "notifications", "stars"])

const goToWorkspaceSurfaceAt = (a: AppCtx, index: number) => {
	const surface = a.listNav.surfaces[index]
	if (surface) a.listNav.switchWorkspaceSurface(surface)
}

export const appKeymap = App(
	// Always-on: command palette opener
	{ id: "command.open", title: "Open command palette", keys: ["ctrl+p", "meta+k"], run: (s) => s.openCommandPalette() },
	{ id: "command.open-help", title: "Open command palette", keys: ["?"], when: (s) => !s.textInputActive, run: (s) => s.openCommandPalette() },

	// Quit / close-active-modal — gated to "not editing text"
	{
		id: "app.quit-or-close",
		title: "Quit / close modal",
		keys: ["ctrl+c"],
		run: (s) => s.handleQuitOrClose(),
	},
	{
		id: "app.quit-or-close-q",
		title: "Quit / close modal",
		keys: ["q"],
		when: (s) => !s.textInputActive,
		run: (s) => s.handleQuitOrClose(),
	},

	// `listNav` only binds 1/2/3, and it is suppressed while a fork-owned
	// surface (Inbox, Projects) is active — so 4 and 5 live here, where they are
	// always on. Positional rather than hard-coded to a surface name: the tab
	// strip differs between user scope and repository scope.
	{ id: "workspace.fourth", title: "Fourth surface", keys: ["4"], when: (s) => inListMode(s), run: (s) => goToWorkspaceSurfaceAt(s, 3) },
	{ id: "workspace.fifth", title: "Fifth surface", keys: ["5"], when: (s) => inListMode(s), run: (s) => goToWorkspaceSurfaceAt(s, 4) },
	{ id: "workspace.sixth", title: "Sixth surface", keys: ["6"], when: (s) => inListMode(s), run: (s) => goToWorkspaceSurfaceAt(s, 5) },
	{ id: "workspace.inbox", title: "Go to inbox", keys: ["g n"], when: (s) => inListMode(s), run: (s) => s.listNav.switchWorkspaceSurface("notifications") },
	{ id: "workspace.stars", title: "Go to stars", keys: ["g s"], when: (s) => inListMode(s), run: (s) => s.listNav.switchWorkspaceSurface("stars") },

	// Modal layers
	closeModalKeymap.scope((a) => a.closeModalActive && a.closeModal),
	pullRequestStateModalKeymap.scope((a) => a.pullRequestStateModalActive && a.pullRequestStateModal),
	mergeModalKeymap.scope((a) => a.mergeModalActive && a.mergeModal),
	commentThreadModalKeymap.scope((a) => a.commentThreadModalActive && a.commentThreadModal),
	changedFilesModalKeymap.scope((a) => a.changedFilesModalActive && a.changedFilesModal),
	filterModalKeymap.scope((a) => a.filterModalActive && a.filterModal),
	submitReviewModalKeymap.scope((a) => a.submitReviewModalActive && a.submitReviewModal),
	labelModalKeymap.scope((a) => a.labelModalActive && a.labelModal),
	themeModalKeymap.scope((a) => a.themeModalActive && a.themeModal),
	openRepositoryModalKeymap.scope((a) => a.openRepositoryModalActive && a.openRepositoryModal),
	commentModalKeymap.scope((a) => a.commentModalActive && a.commentModal),
	deleteCommentModalKeymap.scope((a) => a.deleteCommentModalActive && a.deleteCommentModal),
	commandPaletteKeymap.scope((a) => a.commandPaletteActive && a.commandPalette),
	filterModeKeymap.scope((a) => a.filterMode && a.filterModeCtx),

	// Full-view layers (only when no modal is on top)
	diffViewKeymap.scope((a) => a.diffFullView && !modalActive(a) && a.diff),
	runsViewKeymap.scope((a) => a.runsFullView && !modalActive(a) && a.runs),
	detailViewKeymap.scope((a) => a.detailFullView && !modalActive(a) && a.detail),
	commentsViewKeymap.scope((a) => a.commentsViewActive && !modalActive(a) && a.commentsView),

	// Fork-owned surfaces — see src/projects/keymap.ts and src/notifications/keymap.ts
	projectsViewKeymap.scope((a) => (modalActive(a) || a.filterMode ? null : buildProjectsViewCtx(a.listNav))),
	inboxViewKeymap.scope((a) => (modalActive(a) || a.filterMode ? null : buildInboxViewCtx(a.listNav))),
	starsViewKeymap.scope((a) => (modalActive(a) || a.filterMode ? null : buildStarsViewCtx(a.listNav))),

	// PR list nav
	listNavKeymap.scope((a) => inListMode(a) && !FORK_OWNED_SURFACES.has(a.listNav.activeSurface) && a.listNav),
)
