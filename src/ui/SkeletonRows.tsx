import { colors, mixHex } from "./colors.js"
import { TextLine } from "./primitives.js"
import { shimmerIntensity } from "./shimmer.js"
import { useSpinnerFrame } from "./useSpinnerFrame.js"

// Placeholder rows shown while a list has nothing to show yet.
//
// The alternative — collapsing the whole pane to one dim "Loading..." line —
// makes every first load look like an empty result for as long as the fetch
// takes, and then reflows the pane the moment rows arrive. Reserving the space
// with bars of roughly the right shape means the list only ever fills in.
//
// The block owns its own frame ticker instead of taking one as a prop: it is
// mounted only while a list is empty-and-loading, so the interval's lifetime is
// already exactly the animation's lifetime, and no loading frame has to be
// threaded down through the surface prop chain to reach it.

const BAR = "█"

/** Rows drawn when a caller does not know how much vertical space it has. */
export const SKELETON_ROW_COUNT = 7

/**
 * Deterministic per-row title widths. Equal-length bars read as a barcode
 * rather than as text, and `Math.random()` would reshuffle them on every frame
 * of the shimmer.
 */
const TITLE_FRACTIONS = [0.66, 0.42, 0.74, 0.51, 0.6, 0.37, 0.7, 0.46, 0.55, 0.63] as const

const titleWidth = (index: number, available: number) => Math.max(6, Math.round(available * TITLE_FRACTIONS[index % TITLE_FRACTIONS.length]!))

/** Visual lines a skeleton block occupies, for the same scroll math real rows use. */
export const skeletonVisualLines = (rowCount: number, compact: boolean) => 1 + rowCount * (compact ? 1 : 2)

/** Rows that fit in `height` lines once the group header has taken its line. */
export const skeletonRowCountForHeight = (height: number, compact: boolean) => Math.max(1, Math.min(24, Math.floor((height - 1) / (compact ? 1 : 2))))

/**
 * Bars sit just above the background so they read as "space reserved" rather
 * than as content; the travelling highlight lifts them toward `muted`, the
 * dimmest colour real rows ever use.
 */
const Bar = ({ width, offset, frame, span, weight = 1 }: { width: number; offset: number; frame: number; span: number; weight?: number }) => (
	<>
		{Array.from({ length: Math.max(0, width) }, (_, index) => (
			<span key={index} fg={mixHex(mixHex(colors.background, colors.separator, 0.55 * weight), colors.muted, shimmerIntensity(offset + index, frame, span))}>
				{BAR}
			</span>
		))}
	</>
)

const SkeletonGroupRow = ({ contentWidth, frame }: { contentWidth: number; frame: number }) => (
	<TextLine width={contentWidth}>
		<span fg={mixHex(colors.background, colors.separator, 0.7)}>{"◆ "}</span>
		<Bar width={Math.max(8, Math.round(contentWidth * 0.22))} offset={2} frame={frame} span={contentWidth} weight={1.25} />
	</TextLine>
)

/** Mirrors `PullRequestRow`'s geometry: review glyph, number, title, trailing age. */
const SkeletonItemRow = ({ contentWidth, index, frame, compact }: { contentWidth: number; index: number; frame: number; compact: boolean }) => {
	const available = Math.max(10, contentWidth - 14)
	const title = titleWidth(index, available)
	const trailingGap = Math.max(1, contentWidth - 8 - title - 4)
	const metaLeft = Math.max(5, Math.round(available * 0.18))
	return (
		<box width={contentWidth} flexDirection="column">
			<TextLine width={contentWidth}>
				<span> </span>
				<Bar width={1} offset={1} frame={frame} span={contentWidth} />
				<span> </span>
				<Bar width={4} offset={3} frame={frame} span={contentWidth} />
				<span> </span>
				<Bar width={title} offset={8} frame={frame} span={contentWidth} />
				<span>{" ".repeat(trailingGap)}</span>
				<Bar width={3} offset={contentWidth - 4} frame={frame} span={contentWidth} />
			</TextLine>
			{compact ? null : (
				<TextLine width={contentWidth}>
					<span>{"     "}</span>
					<Bar width={metaLeft} offset={5} frame={frame} span={contentWidth} weight={0.7} />
					<span> </span>
					<Bar width={Math.max(6, Math.round(available * 0.26))} offset={6 + metaLeft} frame={frame} span={contentWidth} weight={0.7} />
				</TextLine>
			)}
		</box>
	)
}

export const SkeletonList = ({ contentWidth, rowCount, compact }: { contentWidth: number; rowCount: number; compact: boolean }) => {
	const frame = useSpinnerFrame({ active: true, reset: false })
	return (
		<box width={contentWidth} flexDirection="column">
			<SkeletonGroupRow contentWidth={contentWidth} frame={frame} />
			{Array.from({ length: Math.max(0, rowCount) }, (_, index) => (
				<SkeletonItemRow key={index} contentWidth={contentWidth} index={index} frame={frame} compact={compact} />
			))}
		</box>
	)
}
