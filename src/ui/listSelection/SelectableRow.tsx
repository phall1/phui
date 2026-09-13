import { type ReactNode, useState } from "../../solid-hooks.js"
import { colors, rowHoverBackground } from "../colors.js"

// Row background formula used by every selectable list — selection beats
// hover; otherwise no background. Exposed via the children-as-function prop
// so the row's text lines can adopt the same `bg`.
const computeRowBg = (selected: boolean, hovered: boolean): string | undefined => (selected ? colors.selectedBg : hovered ? rowHoverBackground() : undefined)

export interface SelectableRowProps {
	readonly width: number
	readonly height?: number
	readonly selected: boolean
	readonly hovered: boolean
	readonly onSelect: () => void
	readonly onHoverChange: (hovered: boolean) => void
	readonly children: (rowBg: string | undefined) => ReactNode
}

/**
 * Wraps a row in the standard `<box>` + selected/hover background + mouse
 * handlers used by every selectable list. The body is a children-as-function
 * receiving the resolved `rowBg` so inner `<TextLine bg={rowBg}>` lines stay
 * in sync with the wrapper.
 */
export const SelectableRow = (props: SelectableRowProps) => (
	<box
		width={props.width}
		{...(props.height !== undefined ? { height: props.height } : {})}
		flexDirection="column"
		backgroundColor={computeRowBg(props.selected, props.hovered) ?? colors.background}
		onMouseDown={props.onSelect}
		onMouseOver={() => props.onHoverChange(true)}
		onMouseOut={() => props.onHoverChange(false)}
	>
		{props.children(computeRowBg(props.selected, props.hovered))}
	</box>
)

/**
 * Single-source hover-state hook for a selectable list. Returns predicates
 * and setters keyed by the row's natural id (index for index-keyed lists,
 * URL for entity-keyed lists). Avoids the get-then-set ternary the three
 * lists previously inlined three times.
 */
export const useHoverState = <K extends string | number>() => {
	const [hovered, setHovered] = useState<K | null>(null)
	const isHovered = (key: K) => hovered === key
	const onHoverChange = (key: K) => (next: boolean) => setHovered((current) => (next ? (current === key ? current : key) : current === key ? null : current))
	return { isHovered, onHoverChange }
}
