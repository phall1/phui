// A single travelling highlight, shared by every "we are busy" surface so the
// logo, its pulse rail, and the list skeletons all light up on the same beat.
// Frames come from `useSpinnerFrame` (12/s), so a cycle is measured in frames,
// not milliseconds — nothing here needs a clock.

/** Columns the highlight keeps fading over once the head has passed. */
export const SHIMMER_TAIL = 7

/** Dark columns appended to the cycle so the sweep rests before repeating. */
export const SHIMMER_REST = 16

export const shimmerCycle = (width: number) => Math.max(1, width) + SHIMMER_TAIL + SHIMMER_REST

/**
 * Column the highlight's leading edge sits on for `frame`. Starts left of the
 * band (negative) so the sweep enters rather than materialising mid-band.
 */
export const shimmerHead = (frame: number, width: number) => {
	const cycle = shimmerCycle(width)
	const position = ((Math.trunc(frame) % cycle) + cycle) % cycle
	return position - SHIMMER_TAIL
}

/**
 * Brightness in `0..1` for `column`: 1 directly under the head, falling to 0
 * across `SHIMMER_TAIL` columns behind it, and 0 everywhere else.
 */
export const shimmerIntensity = (column: number, frame: number, width: number) => {
	const distance = shimmerHead(frame, width) - column
	if (distance < 0 || distance >= SHIMMER_TAIL) return 0
	return 1 - distance / SHIMMER_TAIL
}
