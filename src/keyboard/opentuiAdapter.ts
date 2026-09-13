import type { KeyEvent } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import type { ParsedStroke } from "@phui/keymap"
import type { KeySubscribe } from "@phui/keymap/solid"
import { useMemo, useRef } from "../solid-hooks.js"

const normalizeKeyName = (name: string) => {
	const key = name.toLowerCase()
	return key === "enter" ? "return" : key
}

/**
 * Map an opentui KeyEvent into @phui/keymap's ParsedStroke.
 * `option` (alt key on Linux/Windows) is folded into `meta` to keep one
 * cross-platform modifier surface.
 */
export const normalizeOpenTuiKey = (event: KeyEvent): ParsedStroke => ({
	key: normalizeKeyName(event.name),
	ctrl: event.ctrl,
	shift: event.shift,
	meta: event.meta || event.option,
})

/**
 * React hook that returns a stable `KeySubscribe` driven by opentui's keyboard.
 *
 * Multiple subscribers (e.g. the `@phui/keymap` dispatcher and any text-input
 * fallback) can each register their own handler. Internally we attach a single
 * `useKeyboard` and fan out to every registered handler, so we don't accidentally
 * stack two `useKeyboard` listeners on the same component.
 */
export const useOpenTuiSubscribe = (): KeySubscribe => {
	const handlersRef = useRef<Set<(stroke: ParsedStroke) => boolean | void>>(new Set())
	const onKey = useRef((event: KeyEvent) => {
		if (event.defaultPrevented) return
		const stroke = normalizeOpenTuiKey(event)
		let handled = false
		for (const handler of handlersRef.current) {
			if (handler(stroke)) handled = true
		}
		if (handled) event.preventDefault()
	})

	useKeyboard((event) => onKey.current(event as KeyEvent))

	return useMemo<KeySubscribe>(
		() => (handler) => {
			handlersRef.current.add(handler)
			return () => {
				handlersRef.current.delete(handler)
			}
		},
		[],
	)
}
