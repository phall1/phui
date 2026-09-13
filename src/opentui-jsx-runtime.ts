export { Fragment, jsx, jsxDEV, jsxs } from "../node_modules/@opentui/solid/jsx-runtime.js"
import type {
	AsciiFontProps,
	BoxProps,
	CodeProps,
	ExtendedIntrinsicElements,
	ImageProps,
	InputProps,
	LinkProps,
	MarkdownProps,
	OpenTUIComponents,
	ScrollBoxProps,
	SelectProps,
	SpanProps,
	TabSelectProps,
	TextareaProps,
	TextProps,
} from "../node_modules/@opentui/solid/src/types/elements.js"
import type { JSX as SolidJSX } from "solid-js"

type WithKey<T> = T & { key?: string | number }
type PhuiSpanProps = SpanProps & { fg?: string; bg?: string; attributes?: number; link?: { url: string }; key?: string | number }

export namespace JSX {
	export type Element = SolidJSX.Element

	export interface IntrinsicAttributes {
		key?: string | number
	}

	export interface IntrinsicElements extends ExtendedIntrinsicElements<OpenTUIComponents> {
		box: WithKey<BoxProps>
		text: WithKey<TextProps>
		span: PhuiSpanProps
		input: WithKey<InputProps>
		select: WithKey<SelectProps>
		ascii_font: WithKey<AsciiFontProps>
		tab_select: WithKey<TabSelectProps>
		scrollbox: WithKey<ScrollBoxProps>
		code: WithKey<CodeProps>
		textarea: WithKey<TextareaProps>
		markdown: WithKey<MarkdownProps>
		image: WithKey<ImageProps>
		b: PhuiSpanProps
		strong: PhuiSpanProps
		i: PhuiSpanProps
		em: PhuiSpanProps
		u: PhuiSpanProps
		br: { key?: string | number }
		a: WithKey<LinkProps>
	}

	export interface ElementChildrenAttribute {
		children: {}
	}
}
