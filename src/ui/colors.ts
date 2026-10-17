export type ThemeId = "system" | "phui" | "one-dark" | "one-light"

export type ThemeTone = "dark" | "light"

export interface ColorPalette {
	readonly background: string
	readonly modalBackground: string
	readonly text: string
	readonly muted: string
	readonly separator: string
	readonly accent: string
	readonly link: string
	readonly inlineCode: string
	readonly error: string
	readonly selectedBg: string
	readonly selectedText: string
	readonly count: string
	readonly status: {
		readonly draft: string
		readonly approved: string
		readonly changes: string
		readonly review: string
		readonly none: string
		readonly passing: string
		readonly pending: string
		readonly failing: string
	}
	readonly repos: {
		readonly opencode: string
		readonly "effect-smol": string
		readonly "opencode-console": string
		readonly opencontrol: string
		readonly default: string
	}
	readonly diff: {
		readonly addedBg: string
		readonly removedBg: string
		readonly contextBg: string
		readonly lineNumberBg: string
		readonly addedLineNumberBg: string
		readonly removedLineNumberBg: string
	}
}

export interface ThemeDefinition {
	readonly id: ThemeId
	readonly name: string
	readonly description: string
	readonly tone: ThemeTone
	readonly colors: ColorPalette
}

interface TerminalThemeColors {
	readonly palette: readonly (string | null)[]
	readonly defaultForeground: string | null
	readonly defaultBackground: string | null
	readonly highlightBackground: string | null
	readonly highlightForeground: string | null
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/

export const isHexColor = (value: string | null | undefined): value is string => typeof value === "string" && HEX_COLOR_RE.test(value)

const readableHex = (value: string | null | undefined, fallback: string) => (isHexColor(value) ? value : fallback)

const hexToRgb = (hex: string) => {
	const value = hex.replace(/^#/, "").slice(0, 6)
	return {
		r: parseInt(value.slice(0, 2), 16),
		g: parseInt(value.slice(2, 4), 16),
		b: parseInt(value.slice(4, 6), 16),
	}
}

const luminance = (hex: string) => {
	const { r, g, b } = hexToRgb(hex)
	return 0.299 * r + 0.587 * g + 0.114 * b
}

const rgbToHex = ({ r, g, b }: { readonly r: number; readonly g: number; readonly b: number }) =>
	`#${[r, g, b]
		.map((component) =>
			Math.max(0, Math.min(255, Math.round(component)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`

export const mixHex = (base: string, overlay: string, amount: number) => {
	const from = hexToRgb(base)
	const to = hexToRgb(overlay)
	return rgbToHex({
		r: from.r + (to.r - from.r) * amount,
		g: from.g + (to.g - from.g) * amount,
		b: from.b + (to.b - from.b) * amount,
	})
}

export const rowHoverBackground = () => mixHex(colors.modalBackground, colors.selectedBg, 0.38)

const grayscaleRamp = (background: string) => {
	const bg = hexToRgb(background)
	const bgLum = luminance(background)
	const isDark = bgLum < 128
	const grays: Record<number, string> = {}

	for (let i = 1; i <= 12; i++) {
		const factor = i / 12
		let r: number
		let g: number
		let b: number

		if (isDark) {
			if (bgLum < 10) {
				const value = Math.floor(factor * 0.4 * 255)
				r = value
				g = value
				b = value
			} else {
				const nextLum = bgLum + (255 - bgLum) * factor * 0.4
				const ratio = nextLum / bgLum
				r = Math.min(bg.r * ratio, 255)
				g = Math.min(bg.g * ratio, 255)
				b = Math.min(bg.b * ratio, 255)
			}
		} else if (bgLum > 245) {
			const value = Math.floor(255 - factor * 0.4 * 255)
			r = value
			g = value
			b = value
		} else {
			const nextLum = bgLum * (1 - factor * 0.4)
			const ratio = nextLum / bgLum
			r = Math.max(bg.r * ratio, 0)
			g = Math.max(bg.g * ratio, 0)
			b = Math.max(bg.b * ratio, 0)
		}

		grays[i] = rgbToHex({ r, g, b })
	}

	return grays
}

const mutedTextColor = (background: string) => {
	const bgLum = luminance(background)
	const isDark = bgLum < 128
	const value = isDark ? (bgLum < 10 ? 180 : Math.min(Math.floor(160 + bgLum * 0.3), 200)) : bgLum > 245 ? 75 : Math.max(Math.floor(100 - (255 - bgLum) * 0.2), 60)
	return rgbToHex({ r: value, g: value, b: value })
}

const contrastText = (background: string) => (luminance(background) > 128 ? "#000000" : "#ffffff")

export const lineNumberTextColor = (background: string, foreground: string) => {
	const bg = readableHex(background, foreground)
	const fg = readableHex(foreground, contrastText(bg))
	const contrast = Math.abs(luminance(bg) - luminance(fg))
	return mixHex(bg, fg, contrast < 90 ? 0.62 : 0.5)
}

const phuiColors: ColorPalette = {
	background: "#111018",
	modalBackground: "#1a1a2e",
	text: "#ede7da",
	muted: "#9f9788",
	separator: "#6f685d",
	accent: "#f4a51c",
	link: "#7fb4ca",
	inlineCode: "#d7c5a1",
	error: "#f97316",
	selectedBg: "#1d2430",
	selectedText: "#f8fafc",
	count: "#d7c5a1",
	status: {
		draft: "#f59e0b",
		approved: "#7dd3a3",
		changes: "#f87171",
		review: "#93c5fd",
		none: "#9f9788",
		passing: "#7dd3a3",
		pending: "#f4a51c",
		failing: "#f87171",
	},
	repos: {
		opencode: "#60a5fa",
		"effect-smol": "#34d399",
		"opencode-console": "#f472b6",
		opencontrol: "#f59e0b",
		default: "#93c5fd",
	},
	diff: {
		addedBg: "#17351f",
		removedBg: "#3a1e22",
		contextBg: "transparent",
		lineNumberBg: "#151515",
		addedLineNumberBg: "#12301a",
		removedLineNumberBg: "#35171b",
	},
}

const makeSystemColors = (terminal?: TerminalThemeColors): ColorPalette => {
	const palette = terminal?.palette ?? []
	const terminalBackground = readableHex(terminal?.defaultBackground, readableHex(palette[0], "#000000"))
	const text = readableHex(terminal?.defaultForeground, readableHex(palette[7], "#ffffff"))
	const grays = grayscaleRamp(terminalBackground)
	const isDark = luminance(terminalBackground) < 128
	const red = readableHex(palette[1], "#cc0000")
	const green = readableHex(palette[2], "#4e9a06")
	const yellow = readableHex(palette[3], "#c4a000")
	const blue = readableHex(palette[4], "#3465a4")
	const magenta = readableHex(palette[5], "#75507b")
	const brightBlack = readableHex(palette[8], mutedTextColor(terminalBackground))
	const brightGreen = readableHex(palette[10], green)
	const brightBlue = readableHex(palette[12], blue)
	const brightMagenta = readableHex(palette[13], magenta)
	const primary = brightBlue
	const panel = grays[2] ?? mixHex(terminalBackground, text, isDark ? 0.07 : 0.08)
	const element = grays[3] ?? mixHex(terminalBackground, text, isDark ? 0.1 : 0.1)
	const border = grays[7] ?? mixHex(terminalBackground, text, isDark ? 0.24 : 0.24)
	const borderSubtle = grays[6] ?? border
	const diffAlpha = isDark ? 0.22 : 0.14

	return {
		background: "transparent",
		modalBackground: panel,
		text,
		muted: mutedTextColor(terminalBackground),
		separator: border,
		accent: primary,
		link: brightBlue,
		inlineCode: brightGreen,
		error: red,
		selectedBg: primary,
		selectedText: contrastText(primary),
		count: primary,
		status: {
			draft: yellow,
			approved: green,
			changes: red,
			review: primary,
			none: brightBlack,
			passing: green,
			pending: yellow,
			failing: red,
		},
		repos: {
			opencode: primary,
			"effect-smol": green,
			"opencode-console": brightMagenta,
			opencontrol: yellow,
			default: blue,
		},
		diff: {
			addedBg: mixHex(terminalBackground, green, diffAlpha),
			removedBg: mixHex(terminalBackground, red, diffAlpha),
			contextBg: panel,
			lineNumberBg: borderSubtle,
			addedLineNumberBg: mixHex(element, green, diffAlpha),
			removedLineNumberBg: mixHex(element, red, diffAlpha),
		},
	}
}

const systemColors: ColorPalette = makeSystemColors()

const oneDarkColors: ColorPalette = {
	background: "#282c34",
	modalBackground: "#2c313c",
	text: "#abb2bf",
	muted: "#7f848e",
	separator: "#4b5263",
	accent: "#61afef",
	link: "#56b6c2",
	inlineCode: "#c678dd",
	error: "#e06c75",
	selectedBg: "#3e4451",
	selectedText: "#ffffff",
	count: "#d19a66",
	status: {
		draft: "#e5c07b",
		approved: "#98c379",
		changes: "#e06c75",
		review: "#61afef",
		none: "#7f848e",
		passing: "#98c379",
		pending: "#e5c07b",
		failing: "#e06c75",
	},
	repos: {
		opencode: "#61afef",
		"effect-smol": "#98c379",
		"opencode-console": "#c678dd",
		opencontrol: "#d19a66",
		default: "#56b6c2",
	},
	diff: {
		addedBg: "#27362b",
		removedBg: "#3a282c",
		contextBg: "transparent",
		lineNumberBg: "#21252b",
		addedLineNumberBg: "#243228",
		removedLineNumberBg: "#35262a",
	},
}

const oneLightColors: ColorPalette = {
	background: "#fafafa",
	modalBackground: "#f0f0f0",
	text: "#383a42",
	muted: "#a0a1a7",
	separator: "#d5d5d5",
	accent: "#4078f2",
	link: "#0184bc",
	inlineCode: "#a626a4",
	error: "#e45649",
	selectedBg: "#e5e5e6",
	selectedText: "#383a42",
	count: "#c18401",
	status: {
		draft: "#c18401",
		approved: "#50a14f",
		changes: "#e45649",
		review: "#4078f2",
		none: "#a0a1a7",
		passing: "#50a14f",
		pending: "#c18401",
		failing: "#e45649",
	},
	repos: {
		opencode: "#4078f2",
		"effect-smol": "#50a14f",
		"opencode-console": "#a626a4",
		opencontrol: "#c18401",
		default: "#0184bc",
	},
	diff: {
		addedBg: "#e1f0d8",
		removedBg: "#f5e1df",
		contextBg: "transparent",
		lineNumberBg: "#f0f0f0",
		addedLineNumberBg: "#d5ebd4",
		removedLineNumberBg: "#f0dedc",
	},
}

// Ayu theme - Modern bright theme with dark, mirage, and light variants

// GitHub Dark Dimmed - Slightly muted variant of GitHub Dark Default

// Material Palenight - Purple-tinted material theme variant

// Cursor theme - Deep charcoal base with Anysphere's signature bright blue accents

export const themeDefinitions: readonly ThemeDefinition[] = [
	{ id: "system", name: "System", description: "Use the terminal foreground, background, and ANSI palette", tone: "dark", colors: systemColors },
	{ id: "phui", name: "PHUI", description: "Warm parchment accents on a deep slate background", tone: "dark", colors: phuiColors },
	{ id: "one-dark", name: "One Dark", description: "Atom-style charcoal with clean blue and green accents", tone: "dark", colors: oneDarkColors },
	{ id: "one-light", name: "One Light", description: "Clean light surfaces with balanced blue and green accents", tone: "light", colors: oneLightColors },
] as const

const pairedThemeIds: Partial<Record<ThemeId, ThemeId>> = {
	"one-dark": "one-light",
	"one-light": "one-dark",
}

let activeTheme = themeDefinitions.find((theme) => theme.id === "phui") ?? themeDefinitions[0]!

export const colors: ColorPalette = { ...phuiColors }

export const getThemeDefinition = (id: ThemeId) => themeDefinitions.find((theme) => theme.id === id) ?? themeDefinitions[0]!

export const isThemeId = (value: unknown): value is ThemeId => typeof value === "string" && themeDefinitions.some((theme) => theme.id === value)

export const themeToneForThemeId = (id: ThemeId): ThemeTone => getThemeDefinition(id).tone

export const oppositeThemeTone = (tone: ThemeTone): ThemeTone => (tone === "dark" ? "light" : "dark")

export const pairedThemeId = (id: ThemeId, tone: ThemeTone): ThemeId | null => {
	const pairedId = pairedThemeIds[id]
	return pairedId && themeToneForThemeId(pairedId) === tone ? pairedId : null
}

export const filterThemeDefinitions = (query: string, tone: ThemeTone = "dark") => {
	const normalized = query.trim().toLowerCase()
	const matchingTone = themeDefinitions.filter((theme) => theme.tone === tone)
	if (normalized.length === 0) return matchingTone
	return matchingTone.filter((theme) => theme.id.includes(normalized) || theme.name.toLowerCase().includes(normalized) || theme.description.toLowerCase().includes(normalized))
}

export const setActiveTheme = (id: ThemeId) => {
	if (activeTheme.id === id) return
	activeTheme = getThemeDefinition(id)
	Object.assign(colors, activeTheme.colors)
}

export const setSystemThemeColors = (terminalColors: TerminalThemeColors) => {
	Object.assign(systemColors, makeSystemColors(terminalColors))
	if (activeTheme.id === "system") {
		Object.assign(colors, systemColors)
	}
}
