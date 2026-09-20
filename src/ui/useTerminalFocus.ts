import { createSignal, onCleanup, onMount, type Accessor } from "solid-js"
import { type MutableRefObject, useRef } from "../solid-hooks.js"

interface RendererFocusEvents {
	on: (event: "focus" | "blur", handler: () => void) => void
	off: (event: "focus" | "blur", handler: () => void) => void
}

export interface UseTerminalFocusInput {
	readonly renderer: RendererFocusEvents
	readonly onFocusReturn: () => void
}

export interface UseTerminalFocusResult {
	readonly terminalFocused: Accessor<boolean>
	readonly terminalFocusedRef: MutableRefObject<boolean>
}

/**
 * Tracks terminal focus/blur, fires onFocusReturn when focus is regained
 * after a blur. Exposes both the reactive accessor and a ref so consumers
 * that need a stable read inside callbacks (without extra deps) can use
 * the ref form.
 */
export const useTerminalFocus = ({ renderer, onFocusReturn }: UseTerminalFocusInput): UseTerminalFocusResult => {
	const [terminalFocused, setTerminalFocused] = createSignal(true)
	const terminalFocusedRef = useRef(true)
	const wasBlurredRef = useRef(false)
	const onFocusReturnRef = useRef(onFocusReturn)
	onFocusReturnRef.current = onFocusReturn

	onMount(() => {
		const handleFocus = () => {
			terminalFocusedRef.current = true
			setTerminalFocused(true)
			if (wasBlurredRef.current) onFocusReturnRef.current()
		}
		const handleBlur = () => {
			wasBlurredRef.current = true
			terminalFocusedRef.current = false
			setTerminalFocused(false)
		}
		renderer.on("focus", handleFocus)
		renderer.on("blur", handleBlur)
		onCleanup(() => {
			renderer.off("focus", handleFocus)
			renderer.off("blur", handleBlur)
		})
	})

	return { terminalFocused, terminalFocusedRef }
}
