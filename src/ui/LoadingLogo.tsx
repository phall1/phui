import { TextAttributes } from "@opentui/core"
import { colors, mixHex } from "./colors.js"
import type { DetailPlaceholderContent } from "./DetailsPane.js"
import { centerCell, Filler, PlainLine, TextLine } from "./primitives.js"
import { shimmerIntensity } from "./shimmer.js"
import { SPINNER_FRAMES } from "./spinner.js"

type LoadingLogoContent = Pick<DetailPlaceholderContent, "hint">

const PHUI_LOGO = ["█▀▀█ █  █ █  █ ▀█▀", "█▀▀▀ █▀▀█ █  █  █ ", "▀    ▀  ▀ ▀▀▀▀ ▀▀▀"] as const

const LOGO_WIDTH = Math.max(...PHUI_LOGO.map((line) => line.length))
const LOGO_HEIGHT = PHUI_LOGO.length
// logo rows + blank + pulse rail + blank + status line
const LOGO_BLOCK_HEIGHT = LOGO_HEIGHT + 4

const PULSE_RAIL = "─"

/**
 * Resting colour for logo column `x`: dim on the left, accent-tinted on the
 * right. Recomputed per render rather than memoised at module scope because
 * `colors` is mutated in place when the theme (or the terminal palette) changes.
 */
const logoBaseColor = (x: number) => mixHex(colors.muted, colors.accent, 0.2 + (x / Math.max(1, LOGO_WIDTH - 1)) * 0.4)

const logoColor = (x: number, frame: number) => mixHex(logoBaseColor(x), colors.text, shimmerIntensity(x, frame, LOGO_WIDTH))

const LogoRow = ({ line, left, frame }: { line: string; left: number; frame: number }) => (
	<TextLine>
		<span fg={colors.muted}>{" ".repeat(left)}</span>
		{Array.from(line.padEnd(LOGO_WIDTH, " "), (char, index) =>
			char === " " ? (
				<span key={index}> </span>
			) : (
				<span key={index} fg={logoColor(index, frame)} attributes={TextAttributes.BOLD}>
					{char}
				</span>
			),
		)}
	</TextLine>
)

/**
 * The rail under the wordmark. Deliberately not a progress bar: startup has no
 * measurable percentage, and a bar that fills at an invented rate is a lie the
 * user learns to distrust. A highlight travelling on the same beat as the logo
 * says "still working" without claiming to know how far along it is.
 */
const PulseRail = ({ left, frame }: { left: number; frame: number }) => (
	<TextLine>
		<span fg={colors.muted}>{" ".repeat(left)}</span>
		{Array.from({ length: LOGO_WIDTH }, (_, index) => (
			<span key={index} fg={mixHex(colors.separator, colors.accent, shimmerIntensity(index, frame, LOGO_WIDTH))}>
				{PULSE_RAIL}
			</span>
		))}
	</TextLine>
)

export const LoadingLogo = ({ content, width, frame }: { content: LoadingLogoContent; width: number; frame: number }) => {
	const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!
	const logoLeft = Math.max(0, Math.floor((width - LOGO_WIDTH) / 2))

	return (
		<box flexDirection="column" width={width}>
			{PHUI_LOGO.map((line, index) => (
				<LogoRow key={index} line={line} left={logoLeft} frame={frame} />
			))}
			<box height={1} />
			<PulseRail left={logoLeft} frame={frame} />
			<box height={1} />
			<PlainLine text={centerCell(`${spinner} ${content.hint}`, width)} fg={colors.muted} />
		</box>
	)
}

export const LoadingLogoPane = ({ content, width, height, frame }: { content: LoadingLogoContent; width: number; height: number; frame: number }) => {
	if (width < LOGO_WIDTH + 2 || height < LOGO_BLOCK_HEIGHT) {
		const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!
		const topRows = Math.max(0, Math.floor((height - 1) / 2))
		const bottomRows = Math.max(0, height - topRows - 1)
		return (
			<box height={height} flexDirection="column">
				<Filler rows={topRows} prefix="loading-logo-compact-top" />
				<PlainLine text={centerCell(`${spinner} ${content.hint}`, width)} fg={colors.muted} />
				<Filler rows={bottomRows} prefix="loading-logo-compact-bottom" />
			</box>
		)
	}

	const topRows = Math.max(0, Math.floor((height - LOGO_BLOCK_HEIGHT) / 2))
	const bottomRows = Math.max(0, height - topRows - LOGO_BLOCK_HEIGHT)

	return (
		<box height={height} flexDirection="column">
			<Filler rows={topRows} prefix="loading-logo-top" />
			<LoadingLogo content={content} width={width} frame={frame} />
			<Filler rows={bottomRows} prefix="loading-logo-bottom" />
		</box>
	)
}
