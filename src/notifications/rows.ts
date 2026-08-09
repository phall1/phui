// === Inbox: row model ===
//
// Pure derivation from a report to the exact sequence of lines the view
// renders, plus the indices that are selectable. Kept out of the component so
// the grouping and the cursor arithmetic are directly testable.

import { notificationBucketLabels, notificationBuckets, reasonBucket, unreadCount, type NotificationBucket, type NotificationItem, type NotificationsReport } from "./types.js"

export type NotificationsRow =
	| { readonly kind: "heading"; readonly key: string; readonly bucket: NotificationBucket; readonly count: number; readonly unread: number }
	| { readonly kind: "item"; readonly key: string; readonly item: NotificationItem }
	| { readonly kind: "blank"; readonly key: string }
	| { readonly kind: "note"; readonly key: string; readonly text: string; readonly tone: "warning" | "muted" }

export interface NotificationsRowModel {
	readonly rows: readonly NotificationsRow[]
	/** Indices into `rows` that the cursor may land on, in order. */
	readonly selectable: readonly number[]
}

export const clampSelection = (value: number, length: number) => (length === 0 ? 0 : Math.max(0, Math.min(value, length - 1)))

const bucketOf = (item: NotificationItem) => reasonBucket(item.reason)

export interface NotificationsRowsOptions {
	/** Hide rows GitHub has already marked read; the fetch may still have returned them. */
	readonly unreadOnly: boolean
	/** Ids optimistically removed by a "done" that has not been re-fetched yet. */
	readonly dismissed: ReadonlySet<string>
	/** Ids optimistically flipped to read by a mark-read that has not been re-fetched yet. */
	readonly read: ReadonlySet<string>
}

/** Applies the optimistic overlays the view keeps between fetches. */
export const visibleNotifications = (items: readonly NotificationItem[], options: NotificationsRowsOptions): readonly NotificationItem[] =>
	items
		.filter((item) => !options.dismissed.has(item.id))
		.map((item) => (options.read.has(item.id) ? { ...item, unread: false } : item))
		.filter((item) => !options.unreadOnly || item.unread)

export const notificationsRows = (report: NotificationsReport, options: NotificationsRowsOptions): NotificationsRowModel => {
	const items = visibleNotifications(report.items, options)
	const rows: NotificationsRow[] = []
	const selectable: number[] = []

	for (const warning of report.warnings) rows.push({ kind: "note", key: `warning-${rows.length}`, text: warning, tone: "warning" })
	if (report.warnings.length > 0) rows.push({ kind: "blank", key: `warning-gap` })

	// Bucket order is fixed rather than data-driven: the whole point of the
	// surface is that "needs you" is always at the top, even on the days it is
	// empty and "watching" has forty rows.
	let first = true
	for (const bucket of notificationBuckets) {
		const bucketItems = items.filter((item) => bucketOf(item) === bucket)
		if (bucketItems.length === 0) continue
		if (!first) rows.push({ kind: "blank", key: `gap-${bucket}` })
		first = false
		rows.push({ kind: "heading", key: `heading-${bucket}`, bucket, count: bucketItems.length, unread: unreadCount(bucketItems) })
		for (const item of bucketItems) {
			selectable.push(rows.length)
			rows.push({ kind: "item", key: `item-${item.id}`, item })
		}
	}

	return { rows, selectable }
}

export const bucketLabel = (bucket: NotificationBucket) => notificationBucketLabels[bucket]

export const selectedNotification = (model: NotificationsRowModel, selectionIndex: number): NotificationItem | null => {
	const rowIndex = model.selectable[clampSelection(selectionIndex, model.selectable.length)]
	if (rowIndex === undefined) return null
	const row = model.rows[rowIndex]
	return row?.kind === "item" ? row.item : null
}
