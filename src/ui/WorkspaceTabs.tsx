import { Index, createSignal } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { colors, mixHex, rowHoverBackground } from "./colors.js"
import { fitCell, TextLine } from "./primitives.js"
import { workspaceSurfaceLabels, workspaceSurfaces, type WorkspaceSurface } from "../workspaceSurfaces.js"

export type WorkspaceSurfaceCounts = Partial<Record<WorkspaceSurface, number | string>>

const tabText = (surface: WorkspaceSurface, counts: WorkspaceSurfaceCounts) => {
	const label = workspaceSurfaceLabels[surface]
	const count = counts[surface]
	return count === undefined ? ` ${label} ` : ` ${label} ${count} `
}

export const workspaceTabSeparatorColumns = (counts: WorkspaceSurfaceCounts, surfaces: readonly WorkspaceSurface[] = workspaceSurfaces) => {
	const columns: number[] = []
	let column = 0
	for (const surface of surfaces) {
		column += tabText(surface, counts).length
		columns.push(column)
		column += 1
	}
	return columns
}

/**
 * Rendered with `<Index>` over the (stable) surface list so a change to
 * `counts` updates the count text in place instead of rebuilding every tab
 * renderable. Rebuilding on every selection change tripped a native
 * TextBufferView allocation storm under rapid key bursts.
 */
export const WorkspaceTabs = (props: {
	activeSurface: WorkspaceSurface
	width: number
	surfaces?: readonly WorkspaceSurface[]
	counts?: WorkspaceSurfaceCounts
	onSelect: (surface: WorkspaceSurface) => void
}) => {
	const [hoveredSurface, setHoveredSurface] = createSignal<WorkspaceSurface | null>(null)
	const activeCountColor = mixHex(colors.separator, colors.accent, 0.45)
	const surfaces = () => props.surfaces ?? workspaceSurfaces
	const counts = () => props.counts ?? {}
	const textWidth = () => surfaces().reduce((sum, surface) => sum + tabText(surface, counts()).length, 0) + surfaces().length
	const filler = () => Math.max(0, props.width - textWidth())

	return (
		<box width={props.width} height={1} flexDirection="row">
			<Index each={surfaces()}>
				{(surface, index) => {
					const active = () => surface() === props.activeSurface
					const hovered = () => hoveredSurface() === surface()
					const count = () => counts()[surface()]
					return (
						<>
							{index > 0 ? (
								<box width={1} height={1}>
									<text wrapMode="none" truncate fg={colors.separator}>
										│
									</text>
								</box>
							) : null}
							<box
								width={tabText(surface(), counts()).length}
								height={1}
								onMouseDown={() => props.onSelect(surface())}
								onMouseOver={() => setHoveredSurface(surface())}
								onMouseOut={() => setHoveredSurface((current) => (current === surface() ? null : current))}
							>
								<text wrapMode="none" truncate>
									<span> </span>
									<span fg={active() ? colors.accent : colors.muted} attributes={active() ? TextAttributes.BOLD : 0} {...(hovered() ? { bg: rowHoverBackground() } : {})}>
										{workspaceSurfaceLabels[surface()]}
									</span>
									{count() === undefined ? null : (
										<>
											<span {...(hovered() ? { bg: rowHoverBackground() } : {})}> </span>
											<span fg={active() ? activeCountColor : colors.separator} {...(hovered() ? { bg: rowHoverBackground() } : {})}>
												{count()}
											</span>
										</>
									)}
									<span> </span>
								</text>
							</box>
						</>
					)
				}}
			</Index>
			<box width={1} height={1}>
				<text wrapMode="none" truncate fg={colors.separator}>
					│
				</text>
			</box>
			{filler() > 0 ? <TextLine width={filler()}>{fitCell("", filler())}</TextLine> : null}
		</box>
	)
}
