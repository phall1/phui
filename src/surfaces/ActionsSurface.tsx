import type { RunsViewModel } from "../hooks/useRunsView.js"
import { RepositoryRunsPane } from "../ui/runs/RunsPane.js"

export interface ActionsSurfaceProps {
	readonly repository: string
	readonly runsView: RunsViewModel
	readonly contentWidth: number
	readonly height: number
	readonly loadingIndicator: string
	readonly showScrollbar: boolean
}

export const ActionsSurface = (props: ActionsSurfaceProps) => (
	<RepositoryRunsPane
		repository={props.repository}
		inDetail={props.runsView.inDetail}
		runsState={props.runsView.runsState}
		detailState={props.runsView.detailState}
		runsSelection={props.runsView.runsSelection}
		detailSelection={props.runsView.detailSelection}
		detailRows={props.runsView.detailRows}
		onSelectRow={props.runsView.selectRow}
		onActivateRow={props.runsView.activateRow}
		contentWidth={props.contentWidth}
		height={props.height}
		loadingIndicator={props.loadingIndicator}
		showScrollbar={props.showScrollbar}
	/>
)
