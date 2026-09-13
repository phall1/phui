import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { createEffect, Match, Switch } from "solid-js"
import { useRef, type ReactNode } from "../../solid-hooks.js"
import type { PullRequestItem, WorkflowRun, WorkflowRunDetails } from "../../domain.js"
import { colors } from "../colors.js"
import { centerCell, Divider, fitCell, Filler, PaddedRow, PlainLine, TextLine } from "../primitives.js"
import { shortRepoName } from "../pullRequests.js"
import { conclusionLabel, formatDuration, type RunDetailRow, type RunGlyphKind, runGlyph, runGlyphKind, stepRowKey } from "./runsRows.js"

// A selectable, clickable row whose background spans the full pane width (the
// box carries the width + bg; the inner TextLine adopts the same bg so text and
// fill match). Mouse-down selects; a second handler activates on the App side.
const RunRow = ({ selected, width, onSelect, onActivate, children }: { selected: boolean; width: number; onSelect: () => void; onActivate: () => void; children: ReactNode }) => (
	<box width={width} flexDirection="column" {...(selected ? { backgroundColor: colors.selectedBg } : {})} onMouseDown={selected ? onActivate : onSelect}>
		<TextLine width={width} bg={selected ? colors.selectedBg : undefined}>
			{children}
		</TextLine>
	</box>
)

type ResultState<A> = { readonly status: "loading" } | { readonly status: "error"; readonly message: string } | { readonly status: "ready"; readonly value: A }

const GLYPH_COLOR: Record<RunGlyphKind, string> = {
	success: colors.status.passing,
	failure: colors.status.failing,
	"in-progress": colors.status.pending,
	queued: colors.muted,
	cancelled: colors.status.failing,
	skipped: colors.muted,
	neutral: colors.muted,
}

const relativeAge = (date: Date | null, now: Date): string => {
	if (!date) return ""
	const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000))
	if (seconds < 60) return "just now"
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	return `${Math.floor(hours / 24)}d ago`
}

export interface RunsPaneProps {
	readonly pullRequest: PullRequestItem
	readonly inDetail: boolean
	readonly runsState: ResultState<readonly WorkflowRun[]>
	readonly detailState: ResultState<WorkflowRunDetails> | null
	readonly runsSelection: number
	readonly detailSelection: number
	readonly detailRows: readonly RunDetailRow[]
	readonly onSelectRow: (index: number) => void
	readonly onActivateRow: (index: number) => void
	readonly contentWidth: number
	readonly height: number
	readonly loadingIndicator: string
	readonly showScrollbar: boolean
}

interface WorkflowRunsPaneProps extends Omit<RunsPaneProps, "pullRequest"> {
	readonly repository: string
	readonly listTitle: string
	readonly listRight: string
	readonly listSubline: string
}

const HeaderLine = ({ left, right, width }: { left: string; right: string; width: number }) => {
	const rightWidth = Math.min(right.length, Math.max(0, Math.floor(width * 0.45)))
	const leftWidth = Math.max(1, width - rightWidth - 1)
	return (
		<TextLine>
			<span fg={colors.accent} attributes={TextAttributes.BOLD}>
				{fitCell(left, leftWidth)}
			</span>
			<span> </span>
			<span fg={colors.muted}>{fitCell(right, rightWidth)}</span>
		</TextLine>
	)
}

const centeredMessage = (text: string, color: string, contentWidth: number, bodyHeight: number, key: string) => (
	<>
		<Filler rows={Math.max(0, Math.floor((bodyHeight - 1) / 2))} prefix={`${key}-top`} />
		<PlainLine text={centerCell(text, contentWidth)} fg={color} />
		<Filler rows={Math.max(0, Math.ceil((bodyHeight - 1) / 2))} prefix={`${key}-bottom`} />
	</>
)

const RunsList = ({
	runs,
	selection,
	paneWidth,
	now,
	onSelectRow,
	onActivateRow,
}: {
	runs: readonly WorkflowRun[]
	selection: number
	paneWidth: number
	now: Date
	onSelectRow: (index: number) => void
	onActivateRow: (index: number) => void
}) => {
	const nameWidth = Math.max(10, Math.floor(paneWidth * 0.26))
	const branchWidth = Math.max(10, Math.floor(paneWidth * 0.2))
	const concWidth = 12
	const durWidth = 8
	const ageWidth = 10
	return (
		<box flexDirection="column">
			{runs.map((run, index) => {
				const selected = index === selection
				const reRun = run.attempt > 1 ? `re-run ${run.attempt}` : ""
				return (
					<RunRow key={run.id} selected={selected} width={paneWidth} onSelect={() => onSelectRow(index)} onActivate={() => onActivateRow(index)}>
						<span fg={selected ? colors.accent : colors.muted}>{selected ? "▸ " : "  "}</span>
						<span fg={GLYPH_COLOR[runGlyphKind(run.status, run.conclusion)]}>{runGlyph(run.status, run.conclusion)} </span>
						<span fg={colors.text} attributes={selected ? TextAttributes.BOLD : 0}>
							{fitCell(run.workflowName, nameWidth)}
						</span>
						<span fg={colors.muted}> {fitCell(run.headBranch, branchWidth)}</span>
						<span fg={colors.muted}> {fitCell(conclusionLabel(run.status, run.conclusion), concWidth)}</span>
						<span fg={colors.muted}> {fitCell(formatDuration(run.startedAt, run.updatedAt, now), durWidth)}</span>
						<span fg={colors.muted}> {fitCell(relativeAge(run.createdAt, now), ageWidth)}</span>
						{reRun ? <span fg={colors.muted}> {reRun}</span> : null}
					</RunRow>
				)
			})}
		</box>
	)
}

const RunDetail = ({
	rows,
	selection,
	paneWidth,
	now,
	onSelectRow,
	onActivateRow,
}: {
	rows: readonly RunDetailRow[]
	selection: number
	paneWidth: number
	now: Date
	onSelectRow: (index: number) => void
	onActivateRow: (index: number) => void
}) => {
	const durWidth = 8
	return (
		<box flexDirection="column">
			{rows.map((row, index) => {
				const selected = index === selection
				const indent = row.kind === "step" ? "    " : ""
				const name = row.kind === "job" ? row.job.name : row.step.name
				const duration = row.kind === "job" ? formatDuration(row.job.startedAt, row.job.completedAt, now) : formatDuration(row.step.startedAt, row.step.completedAt, now)
				const nameWidth = Math.max(8, paneWidth - indent.length - 2 - durWidth - 1)
				return (
					<RunRow
						key={row.kind === "job" ? `job-${row.job.id}` : stepRowKey(row.job, row.step)}
						selected={selected}
						width={paneWidth}
						onSelect={() => onSelectRow(index)}
						onActivate={() => onActivateRow(index)}
					>
						<span fg={colors.muted}>{indent}</span>
						<span fg={GLYPH_COLOR[row.glyphKind]}>{row.glyph} </span>
						<span fg={row.kind === "job" ? colors.text : colors.muted} attributes={row.kind === "job" ? TextAttributes.BOLD : 0}>
							{fitCell(name, nameWidth)}
						</span>
						<span fg={colors.muted}>{fitCell(duration, durWidth, "right")}</span>
					</RunRow>
				)
			})}
		</box>
	)
}

const WorkflowRunsPane = (props: WorkflowRunsPaneProps) => {
	const now = new Date()
	const bodyHeight = Math.max(1, props.height - 3)
	const paneWidth = props.contentWidth + 2
	const scrollboxRef = useRef<ScrollBoxRenderable | null>(null)
	createEffect(() => {
		const inDetail = props.inDetail
		const rowCount = inDetail ? props.detailRows.length : props.runsState.status === "ready" ? props.runsState.value.length : 0
		const selection = inDetail ? props.detailSelection : props.runsSelection
		if (rowCount <= bodyHeight) return
		const scrollbox = scrollboxRef.current
		if (!scrollbox) return
		const top = selection
		const bottom = selection + 1
		const viewportTop = scrollbox.scrollTop
		if (top < viewportTop) scrollbox.scrollTo({ x: 0, y: top })
		else if (bottom > viewportTop + bodyHeight) scrollbox.scrollTo({ x: 0, y: Math.max(0, bottom - bodyHeight) })
	})

	return (
		<box flexDirection="column" height={props.height} backgroundColor={colors.background}>
			<PaddedRow>
				<HeaderLine
					left={(() => {
						const detailRun = props.inDetail && props.detailState?.status === "ready" ? props.detailState.value : null
						return detailRun ? `${detailRun.workflowName} #${detailRun.number}` : props.listTitle
					})()}
					right={(() => {
						const detailRun = props.inDetail && props.detailState?.status === "ready" ? props.detailState.value : null
						return detailRun ? `${detailRun.event} → ${detailRun.headBranch}` : props.listRight
					})()}
					width={props.contentWidth}
				/>
			</PaddedRow>
			<PaddedRow>
				<TextLine>
					<span fg={colors.muted}>
						{fitCell(
							(() => {
								const detailRun = props.inDetail && props.detailState?.status === "ready" ? props.detailState.value : null
								return detailRun ? `${detailRun.headSha.slice(0, 7)} · ${detailRun.displayTitle || props.repository}` : props.listSubline
							})(),
							props.contentWidth,
						)}
					</span>
				</TextLine>
			</PaddedRow>
			<Divider width={paneWidth} />
			<box height={bodyHeight} flexDirection="column">
				<Switch>
					<Match when={props.inDetail && props.detailState?.status === "error"}>
						{centeredMessage(props.detailState?.status === "error" ? props.detailState.message : "", colors.error, props.contentWidth, bodyHeight, "run-error")}
					</Match>
					<Match when={props.inDetail && (!props.detailState || props.detailState.status === "loading")}>
						{centeredMessage(`${props.loadingIndicator} Loading run`, colors.muted, props.contentWidth, bodyHeight, "run-loading")}
					</Match>
					<Match when={props.inDetail}>
						<RunDetail
							rows={props.detailRows}
							selection={props.detailSelection}
							paneWidth={paneWidth}
							now={now}
							onSelectRow={props.onSelectRow}
							onActivateRow={props.onActivateRow}
						/>
					</Match>
					<Match when={props.runsState.status === "loading"}>
						{centeredMessage(`${props.loadingIndicator} Loading runs`, colors.muted, props.contentWidth, bodyHeight, "runs-loading")}
					</Match>
					<Match when={props.runsState.status === "error"}>
						{centeredMessage(props.runsState.status === "error" ? props.runsState.message : "", colors.error, props.contentWidth, bodyHeight, "runs-error")}
					</Match>
					<Match when={props.runsState.status === "ready" && props.runsState.value.length === 0}>
						{centeredMessage("No workflow runs for this commit", colors.muted, props.contentWidth, bodyHeight, "no-runs")}
					</Match>
					<Match when={props.runsState.status === "ready"}>
						<RunsList
							runs={props.runsState.status === "ready" ? props.runsState.value : []}
							selection={props.runsSelection}
							paneWidth={paneWidth}
							now={now}
							onSelectRow={props.onSelectRow}
							onActivateRow={props.onActivateRow}
						/>
					</Match>
				</Switch>
			</box>
		</box>
	)
}

export const PullRequestRunsPane = (props: RunsPaneProps) => (
	<WorkflowRunsPane
		repository={props.pullRequest.repository}
		listTitle={`${shortRepoName(props.pullRequest.repository)} #${props.pullRequest.number}`}
		listRight={`${props.pullRequest.headRefName} → ${props.pullRequest.baseRefName}`}
		listSubline={`runs for ${props.pullRequest.headRefOid.slice(0, 7)} · ${props.pullRequest.author}`}
		inDetail={props.inDetail}
		runsState={props.runsState}
		detailState={props.detailState}
		runsSelection={props.runsSelection}
		detailSelection={props.detailSelection}
		detailRows={props.detailRows}
		onSelectRow={props.onSelectRow}
		onActivateRow={props.onActivateRow}
		contentWidth={props.contentWidth}
		height={props.height}
		loadingIndicator={props.loadingIndicator}
		showScrollbar={props.showScrollbar}
	/>
)

export const RepositoryRunsPane = (props: Omit<WorkflowRunsPaneProps, "listTitle" | "listRight" | "listSubline">) => (
	<WorkflowRunsPane
		repository={props.repository}
		listTitle="Actions"
		listRight={props.repository}
		listSubline="recent workflow runs · watching active runs"
		inDetail={props.inDetail}
		runsState={props.runsState}
		detailState={props.detailState}
		runsSelection={props.runsSelection}
		detailSelection={props.detailSelection}
		detailRows={props.detailRows}
		onSelectRow={props.onSelectRow}
		onActivateRow={props.onActivateRow}
		contentWidth={props.contentWidth}
		height={props.height}
		loadingIndicator={props.loadingIndicator}
		showScrollbar={props.showScrollbar}
	/>
)
