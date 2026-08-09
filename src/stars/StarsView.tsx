import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { inboxNavigator } from "../notifications/navigation.js"
import { openUrlAtom } from "../services/systemAtoms.js"
import { colors, mixHex } from "../ui/colors.js"
import { repoColor } from "../ui/pullRequests.js"
import { effectiveFilterQueryAtom, filterDraftAtom, filterModeAtom, filterQueryAtom } from "../ui/filter/atoms.js"
import { centerCell, Divider, Filler, fitCell, PaddedRow, PlainLine, TextLine, trimCell } from "../ui/primitives.js"
import { SkeletonList, skeletonRowCountForHeight } from "../ui/SkeletonRows.js"
import { starsRefreshAtom, starsRemovedAtom, starsReportAtom, starsSelectionAtom, starsSortAtom, unstarRepositoryAtom } from "./atoms.js"
import { clearStarsViewHandle, setStarsViewHandle, type StarsViewHandle } from "./keymap.js"
import { formatStarCount, matchesStarQuery, nextStarsSortMode, sortStarredRepositories, starsSortLabels, type StarredRepository } from "./types.js"

export interface StarsViewProps {
	readonly contentWidth: number
	readonly height: number
	readonly loadingIndicator: string
	readonly showScrollbar: boolean
	readonly onNotice: (message: string) => void
}

const clampSelection = (value: number, length: number) => (length === 0 ? 0 : Math.max(0, Math.min(value, length - 1)))

const relativeAge = (from: Date | null, now: Date): string => {
	if (from === null) return "—"
	const days = Math.max(0, Math.floor((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)))
	if (days === 0) return "today"
	if (days < 31) return `${days}d`
	if (days < 365) return `${Math.floor(days / 30)}mo`
	return `${Math.floor(days / 365)}y`
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

const StarRow = ({
	item,
	width,
	selected,
	now,
	onSelect,
}: {
	readonly item: StarredRepository
	readonly width: number
	readonly selected: boolean
	readonly now: Date
	readonly onSelect: () => void
}) => {
	const rowBg = selected ? colors.selectedBg : undefined
	const starWidth = 6
	// Full `owner/name`, not just the name: half the point of browsing stars is
	// remembering whose repository it was.
	const nameWidth = Math.max(18, Math.min(36, Math.floor(width * 0.3)))
	const languageWidth = width < 96 ? 0 : 12
	const ageWidth = 6
	// marker(3) + stars + one leading space per rendered column.
	const fixed = 3 + starWidth + 1 + nameWidth + (languageWidth > 0 ? languageWidth + 1 : 0) + ageWidth + 1
	const descriptionWidth = Math.max(0, width - fixed - 1)
	return (
		<box width={width} flexDirection="column" {...(rowBg ? { backgroundColor: rowBg } : {})} onMouseDown={onSelect}>
			<TextLine width={width} bg={rowBg}>
				<span fg={selected ? colors.accent : colors.muted}>{selected ? " ▸ " : "   "}</span>
				<span fg={colors.status.pending}>{fitCell(`★${formatStarCount(item.stars)}`, starWidth, "right")}</span>
				<span fg={item.archived ? colors.muted : repoColor(item.repository)} attributes={selected ? TextAttributes.BOLD : 0}>
					{` ${fitCell(item.repository, nameWidth)}`}
				</span>
				{languageWidth > 0 ? <span fg={colors.separator}>{` ${fitCell(item.language ?? "", languageWidth)}`}</span> : null}
				{descriptionWidth > 0 ? (
					<span fg={colors.muted}>{` ${fitCell(item.archived ? `[archived] ${item.description ?? ""}` : (item.description ?? ""), descriptionWidth)}`}</span>
				) : null}
				<span fg={mixHex(colors.background, colors.separator, 0.9)}>{` ${fitCell(relativeAge(item.pushedAt, now), ageWidth, "right")}`}</span>
			</TextLine>
		</box>
	)
}

/**
 * The Stars surface: everything you have starred, searchable at typing speed.
 *
 * It exists because "the repo I starred six months ago" is one of the few
 * things that still forces a trip to github.com. `enter` scopes phui to the
 * repository — from there its pull requests, issues, and Actions are the ones
 * you already know how to drive — so a star is a jump-off point rather than a
 * bookmark you have to open a browser to use.
 *
 * `/` reuses the workspace filter (the footer already renders the input for any
 * surface), so the query lives in the shared filter atoms rather than in a
 * private text field with its own key handling.
 */
export const StarsView = ({ contentWidth, height, loadingIndicator, showScrollbar, onNotice }: StarsViewProps) => {
	const result = useAtomValue(starsReportAtom)
	const [selection, setSelection] = useAtom(starsSelectionAtom)
	const [sort, setSort] = useAtom(starsSortAtom)
	const [removed, setRemoved] = useAtom(starsRemovedAtom)
	const setRefreshes = useAtomSet(starsRefreshAtom)
	const query = useAtomValue(effectiveFilterQueryAtom)
	const filterQuery = useAtomValue(filterQueryAtom)
	const setFilterDraft = useAtomSet(filterDraftAtom)
	const setFilterMode = useAtomSet(filterModeAtom)
	const openUrl = useAtomSet(openUrlAtom, { mode: "promise" })
	const unstar = useAtomSet(unstarRepositoryAtom, { mode: "promise" })

	// Chrome above the body: summary row + subline row + divider row = 3.
	const bodyHeight = Math.max(1, height - 3)
	const paneWidth = contentWidth + 2

	const report = AsyncResult.isSuccess(result) ? result.value : null
	const items = useMemo(() => {
		if (!report) return []
		const kept = report.items.filter((item) => !removed.has(item.repository))
		return sortStarredRepositories(kept, sort).filter((item) => matchesStarQuery(item, query))
	}, [report, removed, sort, query])

	const selectionIndex = clampSelection(selection, items.length)
	const selected = items[selectionIndex] ?? null

	const fetchedAtMs = report?.fetchedAt.getTime() ?? null
	useEffect(() => {
		if (fetchedAtMs === null) return
		setRemoved(new Set<string>())
	}, [fetchedAtMs, setRemoved])

	const refresh = useCallback(() => setRefreshes((current) => current + 1), [setRefreshes])

	useEffect(() => {
		const handle: StarsViewHandle = {
			hasSelection: selected !== null,
			moveSelection: (delta) => setSelection((current) => clampSelection(clampSelection(current, items.length) + delta, items.length)),
			moveSelectionToBoundary: (boundary) => setSelection(boundary === "first" ? 0 : Math.max(0, items.length - 1)),
			openSelected: () => {
				if (!selected) return
				const navigator = inboxNavigator()
				if (!navigator) {
					void openUrl(selected.url).catch(() => onNotice("Could not open the browser."))
					return
				}
				navigator.openRepository(selected.repository)
			},
			openSelectedInBrowser: () => {
				if (!selected) return
				void openUrl(selected.url).catch(() => onNotice("Could not open the browser."))
			},
			// Optimistic, and reversible by hand: the row leaves now, and a failure
			// puts it back with a notice rather than leaving a phantom gap.
			unstarSelected: () => {
				if (!selected) return
				const repository = selected.repository
				setRemoved((current) => new Set([...current, repository]))
				void unstar(repository)
					.then(() => onNotice(`Unstarred ${repository}.`))
					.catch(() => {
						setRemoved((current) => new Set([...current].filter((value) => value !== repository)))
						onNotice(`Could not unstar ${repository}.`)
					})
			},
			cycleSort: () => {
				setSort((current) => nextStarsSortMode(current))
				setSelection(0)
			},
			refresh,
			startFilter: () => {
				setFilterDraft(filterQuery)
				setFilterMode(true)
			},
		}
		setStarsViewHandle(handle)
		return () => clearStarsViewHandle(handle)
	})

	// Every row is height 1, so the row index is the scroll offset.
	const needsScroll = items.length > bodyHeight
	const scrollboxRef = useRef<ScrollBoxRenderable | null>(null)
	useEffect(() => {
		if (!needsScroll) return
		const scrollbox = scrollboxRef.current
		if (!scrollbox) return
		const viewportTop = scrollbox.scrollTop
		if (selectionIndex < viewportTop) scrollbox.scrollTo({ x: 0, y: selectionIndex })
		else if (selectionIndex + 1 > viewportTop + bodyHeight) scrollbox.scrollTo({ x: 0, y: Math.max(0, selectionIndex + 1 - bodyHeight) })
	}, [selectionIndex, needsScroll, bodyHeight, items.length])

	const now = new Date()
	const total = report ? report.items.filter((item) => !removed.has(item.repository)).length : 0

	const summaryLeft = (() => {
		if (!report) return `${loadingIndicator} Loading stars`
		if (total === 0) return "No starred repositories"
		return query.length > 0 ? `${items.length} of ${total} stars` : `${total} stars`
	})()

	const fetchedAge = report ? relativeAge(report.fetchedAt, now) : ""
	// The freshness clause is the first thing to go when the pane is narrow —
	// ellipsising "updated just no…" reads as a rendering bug, not as brevity.
	const summaryRight = !report
		? ""
		: contentWidth < 100
			? `sorted by ${starsSortLabels[sort]}`
			: `sorted by ${starsSortLabels[sort]} · updated ${fetchedAge === "today" ? "just now" : `${fetchedAge} ago`}`

	const subline = (() => {
		if (!report) return "Reading your starred repositories through gh"
		if (report.warnings.length > 0) return report.warnings[0]!
		if (selected) return `${selected.repository}${selected.topics.length > 0 ? ` · ${selected.topics.slice(0, 6).join(" ")}` : ""}`
		return "/ filter · enter open in phui · o browser · s sort · shift-u unstar · r refresh"
	})()

	const body = (() => {
		if (!report) return <SkeletonList contentWidth={paneWidth} rowCount={skeletonRowCountForHeight(bodyHeight, true)} compact />
		if (items.length === 0) {
			return (
				<Centered
					lines={
						query.length > 0
							? [
									{ text: `Nothing matches "${query}".`, fg: colors.text },
									{ text: "press esc to clear the filter", fg: colors.muted },
								]
							: [
									{ text: "You have not starred anything yet.", fg: colors.text },
									{ text: "press r to refresh", fg: colors.muted },
								]
					}
					width={contentWidth}
					height={bodyHeight}
					prefix="stars-empty"
				/>
			)
		}
		return (
			<box flexDirection="column">
				{items.map((item, index) => (
					<StarRow key={item.repository} item={item} width={paneWidth} selected={index === selectionIndex} now={now} onSelect={() => setSelection(index)} />
				))}
			</box>
		)
	})()

	const summaryRightWidth = Math.min(summaryRight.length, Math.max(0, Math.floor(contentWidth * 0.5)))
	const summaryLeftWidth = Math.max(1, contentWidth - summaryRightWidth - 1)

	return (
		<box flexDirection="column" height={height} backgroundColor={colors.background}>
			<PaddedRow>
				<TextLine>
					<span fg={report && report.warnings.length > 0 ? colors.error : colors.accent} attributes={TextAttributes.BOLD}>
						{fitCell(summaryLeft, summaryLeftWidth)}
					</span>
					<span> </span>
					<span fg={colors.muted}>{fitCell(summaryRight, summaryRightWidth)}</span>
				</TextLine>
			</PaddedRow>
			<PaddedRow>
				<TextLine>
					<span fg={colors.muted}>{trimCell(subline, contentWidth)}</span>
				</TextLine>
			</PaddedRow>
			<Divider width={paneWidth} />
			<box height={bodyHeight} flexDirection="column">
				{needsScroll ? (
					<scrollbox ref={scrollboxRef} focusable={false} flexGrow={1} verticalScrollbarOptions={{ visible: showScrollbar }}>
						{body}
					</scrollbox>
				) : (
					<box flexGrow={1} flexDirection="column">
						{body}
					</box>
				)}
			</box>
		</box>
	)
}
