import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"
import { SPINNER_INTERVAL_MS } from "./spinner.js"

export interface UseSpinnerFrameInput {
	readonly active: Accessor<boolean>
	readonly reset: Accessor<boolean>
}

/**
 * Advances the shared busy-spinner frame while `active` is true. Returns a
 * Solid accessor so the indicator is live rather than a one-shot snapshot.
 */
export const useSpinnerFrame = ({ active, reset }: UseSpinnerFrameInput): Accessor<number> => {
	const [frame, setFrame] = createSignal(0)

	createEffect(() => {
		if (!active()) return
		const interval = globalThis.setInterval(() => {
			setFrame((current) => current + 1)
		}, SPINNER_INTERVAL_MS)
		onCleanup(() => globalThis.clearInterval(interval))
	})

	createEffect(() => {
		if (reset()) setFrame(0)
	})

	return frame
}
