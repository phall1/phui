import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Cause from "effect/Cause"
import { useEffect, useRef } from "react"
import { errorMessage } from "../errors.js"
import { openUrlAtom } from "../services/systemAtoms.js"
import { colors } from "../ui/colors.js"
import { centerCell, Divider, Filler, fitCell, PaddedRow, PlainLine, TextLine, trimCell } from "../ui/primitives.js"
import { projectsInventoryAtom, projectsRescanAtom, projectsSelectionAtom, projectsReportAtom, type ProjectsSurfaceState } from "./atoms.js"
import { hasConfiguredRoots } from "./config.js"
import { clearProjectGitHubCache } from "./github.js"
import { clearProjectsViewHandle, setProjectsViewHandle, type ProjectsViewHandle } from "./keymap.js"
import { clampSelection, inventoryCells, projectsRows, rowOpenTarget, scannedRepositoryCount, type ProjectsRow } from "./rows.js"
import { countBySeverity, type FindingSeverity } from "./types.js"

export interface ProjectsViewProps {
	readonly contentWidth: number
	readonly height: number
	readonly loadingIndicator: string
	readonly showScrollbar: boolean
}

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
	error: colors.status.failing,
	warning: colors.status.pending,
	info: colors.muted,
}

const SEVERITY_GLYPH: Record<FindingSeverity, string> = {
	error: "●",
	warning: "▲",
	info: "·",
}

const relativeAge = (from: Date, now: Date): string => {
	const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000))
	if (seconds < 60) return "just now"
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	return `${Math.floor(hours / 24)}d ago`
}

const Block = ({ lines, width }: { readonly lines: readonly { readonly text: string; readonly fg: string; readonly bold?: boolean }[]; readonly width: number }) => (
	<box flexDirection="column" paddingLeft={1}>
		{lines.map((line, index) => (
			<PlainLine key={`block-${index}`} text={trimCell(line.text, width)} fg={line.fg} bold={line.bold ?? false} />
		))}
	</box>
)

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

// A directory sitting in a scan root is the unit of everything here, so the
// name column is deliberately generous; the rest of the line is the "why".
const nameColumnWidth = (width: number) => Math.max(10, Math.min(26, Math.floor(width * 0.24)))

const FindingRow = ({
	row,
	width,
	selected,
	onSelect,
}: {
	readonly row: Extract<ProjectsRow, { kind: "finding" }>
	readonly width: number
	readonly selected: boolean
	readonly onSelect: () => void
}) => {
	const rowBg = selected ? colors.selectedBg : undefined
	const nameWidth = nameColumnWidth(width)
	// marker(3) + glyph(1) + " " + name + " " + text === width, so the line never
	// overflows into opentui's truncation.
	const textWidth = Math.max(4, width - 6 - nameWidth)
	return (
		<box width={width} flexDirection="column" {...(rowBg ? { backgroundColor: rowBg } : {})} onMouseDown={onSelect}>
			<TextLine width={width} bg={rowBg}>
				<span fg={selected ? colors.accent : colors.muted}>{selected ? " ▸ " : "   "}</span>
				<span fg={SEVERITY_COLOR[row.finding.severity]}>{SEVERITY_GLYPH[row.finding.severity]}</span>
				<span fg={colors.text} attributes={selected ? TextAttributes.BOLD : 0}>
					{` ${fitCell(row.finding.projectName, nameWidth)}`}
				</span>
				<span fg={colors.muted}>{` ${fitCell(row.text, textWidth)}`}</span>
			</TextLine>
		</box>
	)
}

const ProjectRow = ({
	row,
	width,
	selected,
	onSelect,
}: {
	readonly row: Extract<ProjectsRow, { kind: "project" }>
	readonly width: number
	readonly selected: boolean
	readonly onSelect: () => void
}) => {
	const rowBg = selected ? colors.selectedBg : undefined
	const cells = inventoryCells(row.project)
	const compact = width < 76
	const branchWidth = compact ? 0 : Math.max(8, Math.min(18, Math.floor(width * 0.16)))
	const stateWidth = 12
	const ageWidth = compact ? 0 : 14
	const lifecycleWidth = width < 96 ? 0 : 8
	// marker(3) + finding dot(1) + one leading space per rendered column.
	const fixed = 5 + (branchWidth > 0 ? branchWidth + 1 : 0) + stateWidth + 1 + (ageWidth > 0 ? ageWidth + 1 : 0) + (lifecycleWidth > 0 ? lifecycleWidth + 1 : 0)
	const nameWidth = Math.max(10, Math.min(30, Math.floor((width - fixed) * 0.5)))
	const remoteWidth = Math.max(0, width - fixed - nameWidth - 1)
	return (
		<box width={width} flexDirection="column" {...(rowBg ? { backgroundColor: rowBg } : {})} onMouseDown={onSelect}>
			<TextLine width={width} bg={rowBg}>
				<span fg={selected ? colors.accent : colors.muted}>{selected ? " ▸ " : "   "}</span>
				<span fg={row.findingCount > 0 ? colors.status.pending : colors.muted}>{row.findingCount > 0 ? "•" : " "}</span>
				<span fg={colors.text} attributes={selected ? TextAttributes.BOLD : 0}>
					{` ${fitCell(cells.name, nameWidth)}`}
				</span>
				{branchWidth > 0 ? <span fg={colors.muted}>{` ${fitCell(cells.branch, branchWidth)}`}</span> : null}
				<span fg={cells.state === "clean" ? colors.muted : colors.count}>{` ${fitCell(cells.state, stateWidth)}`}</span>
				{ageWidth > 0 ? <span fg={colors.muted}>{` ${fitCell(cells.age, ageWidth)}`}</span> : null}
				{lifecycleWidth > 0 ? <span fg={colors.accent}>{` ${fitCell(cells.lifecycle, lifecycleWidth)}`}</span> : null}
				{remoteWidth > 0 ? <span fg={colors.separator}>{` ${fitCell(cells.remote, remoteWidth)}`}</span> : null}
			</TextLine>
		</box>
	)
}

const Rows = ({
	rows,
	width,
	selectedRowIndex,
	onSelect,
}: {
	readonly rows: readonly ProjectsRow[]
	readonly width: number
	readonly selectedRowIndex: number
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
							<span fg={SEVERITY_COLOR[row.severity]} attributes={TextAttributes.BOLD}>
								{trimCell(row.text.toUpperCase(), Math.max(1, width - 8))}
							</span>
							<span fg={colors.count}>{` ${row.count}`}</span>
						</TextLine>
					</box>
				)
			}
			if (row.kind === "finding") return <FindingRow key={row.key} row={row} width={width} selected={index === selectedRowIndex} onSelect={() => onSelect(index)} />
			return <ProjectRow key={row.key} row={row} width={width} selected={index === selectedRowIndex} onSelect={() => onSelect(index)} />
		})}
	</box>
)

// First-run experience for anyone who installs the fork. It must stand ALONE:
// an installed copy (brew tap, npm package, release tarball) ships the binary
// and nothing else, so pointing at a file in the source tree would be a dead
// reference. Hence the literal TOML, inline. Never guess a directory.
const unconfiguredLines = (state: ProjectsSurfaceState): readonly { readonly text: string; readonly fg: string; readonly bold?: boolean }[] => {
	const configPath = state.config.configPath
	// A file that exists but yields no roots is a DIFFERENT problem from a file
	// that was never created, and the user who is stuck is usually the former —
	// most often because their projects.toml failed to parse (below).
	const step1 =
		configPath === null
			? { text: "1. config file loading is disabled (GHUI_PROJECTS_CONFIG_PATH=off)", fg: colors.muted }
			: state.config.configFileExists
				? { text: `1. add roots to  ${configPath}`, fg: colors.text }
				: { text: `1. create        ${configPath}`, fg: colors.text }
	return [
		// Warnings first: a malformed projects.toml must never be indistinguishable
		// from a missing one. `config.warnings` names the key that was rejected.
		...state.config.warnings.map((text) => ({ text: `! ${text}`, fg: colors.error })),
		...(state.config.warnings.length > 0 ? [{ text: "", fg: colors.muted }] : []),
		{ text: "No project roots configured.", fg: colors.text, bold: true },
		{ text: "", fg: colors.muted },
		{ text: "Projects lints the repositories you already have on disk — uncommitted work,", fg: colors.muted },
		{ text: "unpushed branches, red CI on the default branch, duplicate clones, strays.", fg: colors.muted },
		{ text: "", fg: colors.muted },
		step1,
		{ text: "2. put in it:", fg: colors.text },
		{ text: `     roots = ["~/code"]          # directories to scan; ~ is expanded`, fg: colors.accent },
		{ text: `     exclude = ["archive"]       # optional: directory names to skip`, fg: colors.accent },
		{ text: `     staleDays = 14              # optional: days before "stale"`, fg: colors.accent },
		{ text: `     maxDepth = 1                # optional: 1 = a root's children`, fg: colors.accent },
		{ text: "", fg: colors.muted },
		{ text: "Then press r to rescan. GHUI_PROJECTS_ROOTS=~/code works for a one-off run.", fg: colors.muted },
	]
}

/**
 * The Projects surface: a linter over the repositories in the user's configured
 * scan roots. Findings first — the inventory is a toggle (`a`), not the default,
 * because a list of everything you own is not actionable.
 *
 * All state lives in `./atoms.js`; this component only derives rows, keeps the
 * cursor in the viewport, and publishes its actions to the keymap layer.
 */
export const ProjectsView = ({ contentWidth, height, loadingIndicator, showScrollbar }: ProjectsViewProps) => {
	const result = useAtomValue(projectsReportAtom)
	const [selection, setSelection] = useAtom(projectsSelectionAtom)
	const [inventory, setInventory] = useAtom(projectsInventoryAtom)
	const setRescans = useAtomSet(projectsRescanAtom)
	const openUrl = useAtomSet(openUrlAtom, { mode: "promise" })

	// Chrome above the body: summary row + subline row + divider row = 3.
	const bodyHeight = Math.max(1, height - 3)
	const paneWidth = contentWidth + 2

	const state = AsyncResult.isSuccess(result) ? result.value : null
	const failure = AsyncResult.isFailure(result) ? errorMessage(Cause.squash(result.cause)) : null
	const configured = state !== null && hasConfiguredRoots(state.config)
	const model = state !== null && configured ? projectsRows(state.report, inventory) : { rows: [], selectable: [] }
	const selectionIndex = clampSelection(selection, model.selectable.length)
	const selectedRowIndex = model.selectable[selectionIndex] ?? -1
	const selectedRow = selectedRowIndex >= 0 ? (model.rows[selectedRowIndex] ?? null) : null

	// Publish the imperative half of the surface to the keymap layer. Re-run on
	// every render so the closures always see the current rows; cleared on
	// unmount so the layer deactivates instead of acting on a stale view. The
	// clear is identity-guarded (see `clearProjectsViewHandle`) so one App's
	// teardown cannot null out a second App's handle.
	useEffect(() => {
		const handle: ProjectsViewHandle = {
			hasSelection: selectedRow !== null,
			moveSelection: (delta) => setSelection((current) => clampSelection(clampSelection(current, model.selectable.length) + delta, model.selectable.length)),
			moveSelectionToBoundary: (boundary) => setSelection(boundary === "first" ? 0 : Math.max(0, model.selectable.length - 1)),
			// One affordance, two targets: `ciRed` is the only check that carries a
			// URL, so everything else opens its directory. `BrowserOpener.openUrl`
			// shells out to the platform opener (`open` / `xdg-open` / `start`),
			// which handles a local path as happily as an https URL — no new
			// service, and no PullRequestItem to fake for EditorOpener.
			openSelected: () => {
				const target = rowOpenTarget(selectedRow)
				if (target) void openUrl(target).catch(() => undefined)
			},
			toggleInventory: () => {
				setInventory((current) => !current)
				setSelection(0)
			},
			// A manual rescan is a hard refresh: drop the in-process GitHub memo so
			// the refetch is real, then bump the counter the report atom watches.
			rescan: () => {
				clearProjectGitHubCache()
				setRescans((current) => current + 1)
			},
		}
		setProjectsViewHandle(handle)
		return () => clearProjectsViewHandle(handle)
	})

	// Every row is height 1, so the row index is the scroll offset.
	const needsScroll = model.rows.length > bodyHeight
	const scrollboxRef = useRef<ScrollBoxRenderable | null>(null)
	useEffect(() => {
		if (!needsScroll || selectedRowIndex < 0) return
		const scrollbox = scrollboxRef.current
		if (!scrollbox) return
		const viewportTop = scrollbox.scrollTop
		if (selectedRowIndex < viewportTop) scrollbox.scrollTo({ x: 0, y: selectedRowIndex })
		else if (selectedRowIndex + 1 > viewportTop + bodyHeight) scrollbox.scrollTo({ x: 0, y: Math.max(0, selectedRowIndex + 1 - bodyHeight) })
	}, [selectedRowIndex, needsScroll, bodyHeight, model.rows.length])

	const now = new Date()
	const counts = state ? countBySeverity(state.report.findings) : { error: 0, warning: 0, info: 0 }
	const findingCount = state?.report.findings.length ?? 0

	const summaryLeft = (() => {
		if (failure) return "Scan failed"
		if (!state) return `${loadingIndicator} Scanning projects`
		if (!configured) return "Projects not configured"
		if (findingCount === 0) return "All clear"
		const parts = [
			counts.error > 0 ? `${counts.error} error${counts.error === 1 ? "" : "s"}` : null,
			counts.warning > 0 ? `${counts.warning} warning${counts.warning === 1 ? "" : "s"}` : null,
		]
		return parts.filter((part) => part !== null).join(" · ")
	})()

	const summaryRight = (() => {
		if (!state || !configured) return ""
		const repos = scannedRepositoryCount(state.report)
		return `${repos} ${repos === 1 ? "project" : "projects"} · scanned ${relativeAge(state.report.scannedAt, now)}`
	})()

	const subline = (() => {
		if (failure) return failure
		if (!state) return ""
		if (!configured) return state.config.configPath ?? "config file loading disabled"
		if (selectedRow?.kind === "finding" && selectedRow.finding.suggestion) return selectedRow.finding.suggestion
		if (selectedRow?.kind === "project") return selectedRow.project.repo.path
		const roots = state.config.roots.length
		return `${roots} ${roots === 1 ? "root" : "roots"} · a all projects · r rescan · enter open`
	})()

	const body = (() => {
		if (failure) return <Centered lines={[{ text: failure, fg: colors.error }]} width={contentWidth} height={bodyHeight} prefix="projects-error" />
		if (!state) return <Centered lines={[{ text: `${loadingIndicator} Scanning projects`, fg: colors.muted }]} width={contentWidth} height={bodyHeight} prefix="projects-loading" />
		if (!configured) return <Block lines={unconfiguredLines(state)} width={contentWidth} />
		if (model.rows.length === 0) {
			const repos = scannedRepositoryCount(state.report)
			return (
				<Centered
					lines={[
						{ text: `All clear — ${repos} ${repos === 1 ? "project" : "projects"} scanned, nothing to fix.`, fg: colors.text },
						{ text: "press a for the full inventory · r to rescan", fg: colors.muted },
					]}
					width={contentWidth}
					height={bodyHeight}
					prefix="projects-clear"
				/>
			)
		}
		return <Rows rows={model.rows} width={paneWidth} selectedRowIndex={selectedRowIndex} onSelect={(rowIndex) => setSelection(model.selectable.indexOf(rowIndex))} />
	})()

	const summaryRightWidth = Math.min(summaryRight.length, Math.max(0, Math.floor(contentWidth * 0.5)))
	const summaryLeftWidth = Math.max(1, contentWidth - summaryRightWidth - 1)

	return (
		<box flexDirection="column" height={height} backgroundColor={colors.background}>
			<PaddedRow>
				<TextLine>
					<span fg={failure ? colors.error : counts.error > 0 ? colors.status.failing : colors.accent} attributes={TextAttributes.BOLD}>
						{fitCell(summaryLeft, summaryLeftWidth)}
					</span>
					<span> </span>
					<span fg={colors.muted}>{fitCell(summaryRight, summaryRightWidth)}</span>
				</TextLine>
			</PaddedRow>
			<PaddedRow>
				<TextLine>
					<span fg={colors.muted}>{fitCell(subline, contentWidth)}</span>
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
