import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { githubRuntime, mockPrCount } from "../services/runtime.js"
import { defaultListOptions, listNotifications, markAllRead, markThreadDone, markThreadRead, unsubscribeThread } from "./github.js"
import { mockNotificationsReport } from "./mock.js"
import { emptyNotificationsReport, type NotificationsReport } from "./types.js"

// === UI state ===

/** Cursor into the currently rendered selectable rows. Survives tab switches. */
export const notificationsSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)

/**
 * Unread-only is the default because that is what an inbox is for; `u` widens
 * it to everything GitHub still considers "in the inbox".
 */
export const notificationsUnreadOnlyAtom = Atom.make(true).pipe(Atom.keepAlive)

/** `p` narrows to threads you are directly involved in. Changes the fetch, not just the filter. */
export const notificationsParticipatingAtom = Atom.make(false).pipe(Atom.keepAlive)

/** Bumped by `r` and by the poll timer; the report atom reads it to re-fetch. */
export const notificationsRefreshAtom = Atom.make(0).pipe(Atom.keepAlive)

/**
 * Optimistic overlays.
 *
 * Marking a thread done is a round trip to github.com, and re-fetching the
 * whole feed to make one row disappear would make the list flicker and cost a
 * request per keystroke during a triage run. So the row leaves immediately and
 * the id is remembered until the next real fetch replaces the report — at which
 * point the server agrees and the overlay is cleared.
 */
export const notificationsDismissedAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive)
export const notificationsReadAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive)

// === Report ===

/**
 * The feed. `E = never` by contract — see ./github.ts — so this only ever
 * resolves to a value and partial failure reaches the user through `warnings`.
 *
 * `keepAlive` because the workspace tab badge reads the unread count even while
 * the surface is unmounted; without it, leaving the Inbox would drop the count
 * and re-fetch on every return.
 */
export const notificationsReportAtom = githubRuntime
	.atom(
		Effect.fnUntraced(function* (get) {
			// Read purely to subscribe: bumping either of these re-fetches.
			get(notificationsRefreshAtom)
			const participatingOnly = get(notificationsParticipatingAtom)
			const now = new Date()
			if (mockPrCount !== null) return mockNotificationsReport(now)
			return yield* listNotifications({ ...defaultListOptions, participatingOnly, includeRead: true }, now)
		}),
	)
	.pipe(Atom.keepAlive)

export const emptyReport = (now: Date): NotificationsReport => emptyNotificationsReport(now)

// === Mutations ===
//
// Each is a plain runtime fn so the view can `await` it and turn a rejection
// into a footer notice; the optimistic overlay is applied by the caller first.

export const markNotificationReadAtom = githubRuntime.fn<string>()((id) => markThreadRead(id))
export const markNotificationDoneAtom = githubRuntime.fn<string>()((id) => markThreadDone(id))
export const unsubscribeNotificationAtom = githubRuntime.fn<string>()((id) => unsubscribeThread(id))
export const markAllNotificationsReadAtom = githubRuntime.fn<Date>()((before) => markAllRead(before))
