import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useAtomSet as useAtomSetSolid, useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { createEffect, createMemo, onCleanup, onMount } from "solid-js"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useRef } from "../solid-utils.js"
import { openUrlAtom } from "../services/systemAtoms.js"
import { colors, mixHex } from "../ui/colors.js"
import { centerCell, Divider, Filler, fitCell, PaddedRow, PlainLine, TextLine, trimCell } from "../ui/primitives.js"
import { SkeletonList, skeletonRowCountForHeight } from "../ui/SkeletonRows.js"
import {
	markAllNotificationsReadAtom,
	markNotificationDoneAtom,
	markNotificationReadAtom,
	notificationsDismissedAtom,
	notificationsParticipatingAtom,
	notificationsReadAtom,
	notificationsRefreshAtom,
	notificationsReportAtom,
	notificationsSelectionAtom,
	notificationsUnreadOnlyAtom,
	unsubscribeNotificationAtom,
} from "./atoms.js"
import { clearInboxViewHandle, setInboxViewHandle, type InboxViewHandle } from "./keymap.js"
import { inboxNavigator } from "./navigation.js"
import { bucketLabel, clampSelection, notificationsRows, selectedNotification, visibleNotifications, type NotificationsRow } from "./rows.js"
import {
	isOpenableInApp,
	MARK_ALL_READ_CONFIRM_MS,
	markAllReadConfirmNotice,
	notificationReasonLabels,
	notificationSubjectGlyphs,
	unreadCount,
	type NotificationBucket,
	type NotificationItem,
} from "./types.js"

export interface NotificationsViewProps {
	readonly contentWidth: number
	readonly height: number
	readonly loadingIndicator: string
	readonly showScrollbar: boolean
	readonly onNotice: (message: string) => void
}

/** GitHub's own inbox poll floor is 60s; anything faster just burns rate limit. */
const POLL_INTERVAL_MS = 60_000

const BUCKET_COLOR = (bucket: NotificationBucket): string => {
	if (bucket === "needsYou") return colors.accent
	if (bucket === "security") return colors.status.failing
	if (bucket === "ci") return colors.status.pending
	if (bucket === "yours") return colors.status.review
	return colors.muted
}

/** Terse enough for the 4-column age cell on every row. */
const relativeAge = (from: Date, now: Date): string => {
	const minutes = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000))
	if (minutes < 1) return "now"
	if (minutes < 60) return `${minutes}m`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h`
	const days = Math.floor(hours / 24)
	if (days < 30) return `${days}d`
	return `${Math.floor(days / 30)}mo`
}

const lastUpdatedText = (from: Date, now: Date): string => {
	const age = relativeAge(from, now)
	return age === "now" ? "updated just now" : `updated ${age} ago`
}

const Centered = ({
	lines,
	width,
	height,
	prefix,
}: {
	readonly lines: readonly { readonly text: string; readonly fg: string }[]
	readonly width: number
	readonly height: number
	readonly prefix: string
}) => (
	<>
		<Filler rows={Math.max(0, Math.floor((height - lines.length) / 2))} prefix={`${prefix}-top`} />
		{lines.map((line, index) => (
			<PlainLine key={`${prefix}-${index}`} text={centerCell(line.text, width)} fg={line.fg} />
		))}
		<Filler rows={Math.max(0, Math.ceil((height - lines.length) / 2))} prefix={`${prefix}-bottom`} />
	</>
)

const NotificationRow = ({
	item,
	width,
	selected,
	now,
	onSelect,
}: {
	readonly item: NotificationItem
	readonly width: number
	readonly selected: boolean
	readonly now: Date
	readonly onSelect: () => void
}) => {
	const rowBg = selected ? colors.selectedBg : undefined
	const compact = width < 84
	const repoWidth = compact ? 0 : Math.max(12, Math.min(28, Math.floor(width * 0.22)))
	const reasonWidth = compact ? 0 : 11
	const ageWidth = 4
	const numberText = item.number === null ? "" : `#${item.number}`
	const numberWidth = compact ? 0 : 6
	// marker(3) + unread(1) + glyph(1), then one leading space per rendered
	// column including the title's and the age's. Overshoot here does not clip —
	// opentui middle-ellipsises the overflowing span, which looks like a bug.
	const fixed = 5 + (repoWidth > 0 ? repoWidth + 1 : 0) + (numberWidth > 0 ? numberWidth + 1 : 0) + (reasonWidth > 0 ? reasonWidth + 1 : 0) + ageWidth + 2
	const titleWidth = Math.max(8, width - fixed)
	return (
		<box width={width} flexDirection="column" {...(rowBg ? { backgroundColor: rowBg } : {})} onMouseDown={onSelect}>
			<TextLine width={width} bg={rowBg}>
				<span fg={selected ? colors.accent : colors.muted}>{selected ? " ▸ " : "   "}</span>
				<span fg={item.unread ? colors.accent : mixHex(colors.background, colors.separator, 0.8)}>{item.unread ? "●" : "·"}</span>
				<span fg={colors.muted}>{notificationSubjectGlyphs[item.subjectType]}</span>
				{repoWidth > 0 ? <span fg={colors.separator}>{` ${fitCell(item.repository, repoWidth)}`}</span> : null}
				{numberWidth > 0 ? <span fg={colors.count}>{` ${fitCell(numberText, numberWidth, "right")}`}</span> : null}
				<span fg={item.unread ? colors.text : colors.muted} attributes={selected ? TextAttributes.BOLD : 0}>
					{` ${fitCell(item.title, titleWidth)}`}
				</span>
				{reasonWidth > 0 ? <span fg={colors.muted}>{` ${fitCell(notificationReasonLabels[item.reason], reasonWidth)}`}</span> : null}
				<span fg={colors.muted}>{` ${fitCell(relativeAge(item.updatedAt, now), ageWidth, "right")}`}</span>
			</TextLine>
		</box>
	)
}

const Rows = ({
	rows,
	width,
	selectedRowIndex,
	now,
	onSelect,
}: {
	readonly rows: readonly NotificationsRow[]
	readonly width: number
	readonly selectedRowIndex: number
	readonly now: Date
	readonly onSelect: (rowIndex: number) => void
}) => (
	<box flexDirection="column">
		{rows.map((row, index) => {
			if (row.kind === "blank") return <box key={row.key} height={1} />
			if (row.kind === "note") {
				return (
					<box key={row.key} height={1} paddingLeft={1}>
						<TextLine>
							<span fg={row.tone === "warning" ? colors.error : colors.muted}>{trimCell(row.tone === "warning" ? `! ${row.text}` : row.text, Math.max(1, width - 2))}</span>
						</TextLine>
					</box>
				)
			}
			if (row.kind === "heading") {
				return (
					<box key={row.key} height={1} paddingLeft={1}>
						<TextLine>
							<span fg={BUCKET_COLOR(row.bucket)} attributes={TextAttributes.BOLD}>
								{trimCell(bucketLabel(row.bucket), Math.max(1, width - 12))}
							</span>
							<span fg={colors.count}>{` ${row.count}`}</span>
							{row.unread > 0 && row.unread !== row.count ? <span fg={colors.muted}>{` · ${row.unread} unread`}</span> : null}
						</TextLine>
					</box>
				)
			}
			return <NotificationRow key={row.key} item={row.item} width={width} selected={index === selectedRowIndex} now={now} onSelect={() => onSelect(index)} />
		})}
	</box>
)

/**
 * The Inbox: GitHub's notification feed, grouped by what it wants from you
 * rather than by repository or by time.
 *
 * Two things make it worth having in a terminal at all: `enter` opens a pull
 * request *in phui* (see ./navigation.ts) instead of a browser tab, and `d`
 * clears a thread without a round trip through github.com's UI — so a triage
 * pass is `j d j d j enter` and never leaves the keyboard.
 *
 * All state lives in ./atoms.js; this component derives rows, keeps the cursor
 * in the viewport, applies the optimistic overlays, and publishes its actions
 * to the keymap layer.
 */
export const NotificationsView = ({ contentWidth, height, loadingIndicator, showScrollbar, onNotice }: NotificationsViewProps) => {
	const result = useAtomValueSolid(() => notificationsReportAtom)
	const selection = useAtomValueSolid(() => notificationsSelectionAtom)
	const setSelection = useAtomSetSolid(() => notificationsSelectionAtom)
	const unreadOnly = useAtomValueSolid(() => notificationsUnreadOnlyAtom)
	const setUnreadOnly = useAtomSetSolid(() => notificationsUnreadOnlyAtom)
	const participating = useAtomValueSolid(() => notificationsParticipatingAtom)
	const setParticipating = useAtomSetSolid(() => notificationsParticipatingAtom)
	const dismissed = useAtomValueSolid(() => notificationsDismissedAtom)
	const setDismissed = useAtomSetSolid(() => notificationsDismissedAtom)
	const read = useAtomValueSolid(() => notificationsReadAtom)
	const setRead = useAtomSetSolid(() => notificationsReadAtom)
	const setRefreshes = useAtomSetSolid(() => notificationsRefreshAtom)
	const openUrl = useAtomSetSolid(() => openUrlAtom, { mode: "promise" })
	const markRead = useAtomSetSolid(() => markNotificationReadAtom, { mode: "promise" })
	const markDone = useAtomSetSolid(() => markNotificationDoneAtom, { mode: "promise" })
	const unsubscribe = useAtomSetSolid(() => unsubscribeNotificationAtom, { mode: "promise" })
	const markAll = useAtomSetSolid(() => markAllNotificationsReadAtom, { mode: "promise" })
	const markAllReadArmedUntilRef = useRef(0)

	// Chrome above the body: summary row + subline row + divider row = 3.
	const bodyHeight = Math.max(1, height - 3)
	const paneWidth = contentWidth + 2

	const report = createMemo(() => {
		const current = result()
		return AsyncResult.isSuccess(current) ? current.value : null
	})
	const model = createMemo(() => {
		const current = report()
		return current ? notificationsRows(current, { unreadOnly: unreadOnly(), dismissed: dismissed(), read: read() }) : { rows: [], selectable: [] }
	})
	const selectionIndex = createMemo(() => clampSelection(selection(), model().selectable.length))
	const selectedRowIndex = createMemo(() => model().selectable[selectionIndex()] ?? -1)
	const selected = createMemo(() => selectedNotification(model(), selectionIndex()))
	const visible = createMemo(() => {
		const current = report()
		return current ? visibleNotifications(current.items, { unreadOnly: false, dismissed: dismissed(), read: read() }) : []
	})
	const unread = createMemo(() => unreadCount(visible()))

	// A fetch replaces the report wholesale, so the server has now agreed with
	// whatever the overlays were asserting. Clearing them here (rather than at
	// each mutation site) means a failed mutation's overlay also disappears on
	// the next refresh instead of hiding a row forever.
	const fetchedAtMs = createMemo(() => report()?.fetchedAt.getTime() ?? null)
	createEffect(() => {
		if (fetchedAtMs() === null) return
		setDismissed(new Set<string>())
		setRead(new Set<string>())
	})

	const refresh = () => setRefreshes((current) => current + 1)

	onMount(() => {
		const timer = globalThis.setInterval(refresh, POLL_INTERVAL_MS)
		onCleanup(() => globalThis.clearInterval(timer))
	})

	// Publish the imperative half of the surface to the keymap layer. Re-runs
	// whenever the rows or filters change so the closures always see current
	// state; cleared on unmount so the layer deactivates instead of acting on a
	// stale view.
	createEffect(() => {
		const currentSelected = selected()
		const currentModel = model()
		const currentReport = report()
		const currentUnread = unread()
		const currentUnreadOnly = unreadOnly()
		const currentParticipating = participating()

		const step = (delta: number) => setSelection((current) => clampSelection(clampSelection(current, currentModel.selectable.length) + delta, currentModel.selectable.length))
		const rememberRead = (id: string) => setRead((current) => new Set([...current, id]))

		const openInBrowser = (item: NotificationItem) => {
			if (item.url === null) {
				onNotice("GitHub gave this notification no address to open.")
				return
			}
			rememberRead(item.id)
			void openUrl(item.url).catch(() => onNotice("Could not open the browser."))
			void markRead(item.id).catch(() => undefined)
		}

		const handle: InboxViewHandle = {
			hasSelection: currentSelected !== null,
			canOpenInApp: currentSelected !== null && isOpenableInApp(currentSelected) && inboxNavigator() !== null,
			unreadOnly: currentUnreadOnly,
			participatingOnly: currentParticipating,
			moveSelection: step,
			moveSelectionToBoundary: (boundary) => setSelection(boundary === "first" ? 0 : Math.max(0, currentModel.selectable.length - 1)),

			// `enter` prefers phui and falls back to the browser, rather than
			// refusing: a release or a discussion is still something you wanted to
			// look at, and a dead key on those rows would teach you to stop pressing
			// it on the rows where it does work.
			openSelected: () => {
				if (!currentSelected) return
				const navigator = inboxNavigator()
				if (navigator && isOpenableInApp(currentSelected) && currentSelected.number !== null) {
					rememberRead(currentSelected.id)
					void markRead(currentSelected.id).catch(() => undefined)
					const target = { repository: currentSelected.repository, number: currentSelected.number }
					if (currentSelected.subjectType === "PullRequest") {
						void navigator.openPullRequest(target).catch(() => onNotice(`Could not open ${currentSelected.repository}#${currentSelected.number}.`))
					} else {
						navigator.openIssue(target)
						onNotice(`${currentSelected.repository} issues — looking for #${currentSelected.number}`)
					}
					return
				}
				openInBrowser(currentSelected)
			},
			openSelectedInBrowser: () => {
				if (currentSelected) openInBrowser(currentSelected)
			},

			// Done is the action that actually empties a queue, so it is optimistic:
			// the row leaves now and the request settles behind it. A failure puts
			// it back rather than leaving a phantom gap.
			markSelectedDone: () => {
				if (!currentSelected) return
				const id = currentSelected.id
				setDismissed((current) => new Set([...current, id]))
				void markDone(id).catch(() => {
					setDismissed((current) => new Set([...current].filter((value) => value !== id)))
					onNotice("Could not mark that notification done.")
				})
			},
			toggleSelectedRead: () => {
				if (!currentSelected) return
				const id = currentSelected.id
				if (!currentSelected.unread) {
					onNotice("GitHub has no API for marking a single thread unread again.")
					return
				}
				rememberRead(id)
				void markRead(id).catch(() => {
					setRead((current) => new Set([...current].filter((value) => value !== id)))
					onNotice("Could not mark that notification read.")
				})
			},
			unsubscribeSelected: () => {
				if (!currentSelected) return
				const id = currentSelected.id
				setDismissed((current) => new Set([...current, id]))
				void unsubscribe(id).catch(() => {
					setDismissed((current) => new Set([...current].filter((value) => value !== id)))
					onNotice("Could not unsubscribe from that thread.")
				})
			},
			markAllRead: () => {
				if (!currentReport) return
				const count = currentUnread
				if (count === 0) {
					markAllReadArmedUntilRef.current = 0
					onNotice("Nothing unread.")
					return
				}
				const now = Date.now()
				if (now >= markAllReadArmedUntilRef.current) {
					markAllReadArmedUntilRef.current = now + MARK_ALL_READ_CONFIRM_MS
					onNotice(markAllReadConfirmNotice(count))
					return
				}
				markAllReadArmedUntilRef.current = 0
				setRead(new Set(currentReport.items.map((item) => item.id)))
				void markAll(currentReport.fetchedAt)
					.then(() => onNotice(`Marked ${count} ${count === 1 ? "notification" : "notifications"} read.`))
					.catch(() => {
						setRead(new Set<string>())
						onNotice("Could not mark everything read.")
					})
			},
			toggleUnreadOnly: () => {
				setUnreadOnly((current) => !current)
				setSelection(0)
			},
			toggleParticipating: () => {
				setParticipating((current) => !current)
				setSelection(0)
			},
			refresh,
		}
		setInboxViewHandle(handle)
		onCleanup(() => clearInboxViewHandle(handle))
	})

	// Every row is height 1, so the row index is the scroll offset.
	const needsScroll = createMemo(() => model().rows.length > bodyHeight)
	const scrollboxRef = useRef<ScrollBoxRenderable | null>(null)
	createEffect(() => {
		const currentNeedsScroll = needsScroll()
		const currentSelectedRowIndex = selectedRowIndex()
		if (!currentNeedsScroll || currentSelectedRowIndex < 0) return
		const scrollbox = scrollboxRef.current
		if (!scrollbox) return
		const viewportTop = scrollbox.scrollTop
		if (currentSelectedRowIndex < viewportTop) scrollbox.scrollTo({ x: 0, y: currentSelectedRowIndex })
		else if (currentSelectedRowIndex + 1 > viewportTop + bodyHeight) scrollbox.scrollTo({ x: 0, y: Math.max(0, currentSelectedRowIndex + 1 - bodyHeight) })
	})

	const now = new Date()

	const summaryLeft = createMemo(() => {
		const currentReport = report()
		const currentVisible = visible()
		if (!currentReport) return `${loadingIndicator} Loading inbox`
		if (currentVisible.length === 0) return "Inbox zero"
		return unread() === 0 ? `${currentVisible.length} threads · all read` : `${unread()} unread`
	})

	const summaryRight = createMemo(() => {
		const currentReport = report()
		if (!currentReport) return ""
		const filters = [unreadOnly() ? "unread only" : "all threads", ...(participating() ? ["participating"] : [])]
		return `${filters.join(" · ")} · ${lastUpdatedText(currentReport.fetchedAt, now)}`
	})

	const subline = createMemo(() => {
		const currentReport = report()
		const currentSelected = selected()
		if (!currentReport) return "Reading GitHub notifications through gh"
		if (currentSelected) return currentSelected.url ?? `${currentSelected.repository} · ${currentSelected.subjectType}`
		return "enter open · o browser · d done · m read · u unread-only · p participating · shift-a read all · r refresh"
	})

	const body = createMemo(() => {
		const currentReport = report()
		const currentModel = model()
		const currentSelectedRowIndex = selectedRowIndex()
		if (!currentReport) return <SkeletonList contentWidth={paneWidth} rowCount={skeletonRowCountForHeight(bodyHeight, true)} compact />
		if (currentModel.rows.length === 0) {
			return (
				<Centered
					lines={[
						{ text: unreadOnly() ? "Inbox zero — nothing unread." : "Inbox zero — nothing here at all.", fg: colors.text },
						{ text: unreadOnly() ? "press u to include threads you have already read · r to refresh" : "press r to refresh", fg: colors.muted },
					]}
					width={contentWidth}
					height={bodyHeight}
					prefix="inbox-empty"
				/>
			)
		}
		return (
			<Rows
				rows={currentModel.rows}
				width={paneWidth}
				selectedRowIndex={currentSelectedRowIndex}
				now={now}
				onSelect={(rowIndex) => setSelection(currentModel.selectable.indexOf(rowIndex))}
			/>
		)
	})

	const summaryRightWidth = createMemo(() => Math.min(summaryRight().length, Math.max(0, Math.floor(contentWidth * 0.5))))
	const summaryLeftWidth = createMemo(() => Math.max(1, contentWidth - summaryRightWidth() - 1))

	return (
		<box flexDirection="column" height={height} backgroundColor={colors.background}>
			<PaddedRow>
				<TextLine>
					<span fg={unread() > 0 ? colors.accent : colors.muted} attributes={TextAttributes.BOLD}>
						{fitCell(summaryLeft(), summaryLeftWidth())}
					</span>
					<span> </span>
					<span fg={colors.muted}>{fitCell(summaryRight(), summaryRightWidth())}</span>
				</TextLine>
			</PaddedRow>
			<PaddedRow>
				<TextLine>
					<span fg={colors.muted}>{fitCell(subline(), contentWidth)}</span>
				</TextLine>
			</PaddedRow>
			<Divider width={paneWidth} />
			<box height={bodyHeight} flexDirection="column">
				{needsScroll() ? (
					<scrollbox ref={scrollboxRef} focusable={false} flexGrow={1} verticalScrollbarOptions={{ visible: showScrollbar }}>
						{body()}
					</scrollbox>
				) : (
					<box flexGrow={1} flexDirection="column">
						{body()}
					</box>
				)}
			</box>
		</box>
	)
}
