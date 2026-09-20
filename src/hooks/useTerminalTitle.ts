import { createEffect } from "solid-js"
import { readMaybeAccessor, type MaybeAccessor } from "../solid-utils.js"
import { createTerminalTitleWriterForOutput, deriveTerminalTitle, type TerminalTitleOutput, type TerminalTitleState } from "../terminalTitle.js"

const standardOutput = (): TerminalTitleOutput | undefined => (typeof process === "undefined" ? undefined : process.stdout)

export const useTerminalTitle = (state: MaybeAccessor<TerminalTitleState>): void => {
	const writer = createTerminalTitleWriterForOutput(standardOutput())

	createEffect(() => {
		const title = deriveTerminalTitle(readMaybeAccessor(state))
		writer?.(title)
	})
}
