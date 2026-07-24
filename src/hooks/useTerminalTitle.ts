import { useEffect, useMemo } from "react"
import { createTerminalTitleWriterForOutput, deriveTerminalTitle, type TerminalTitleOutput, type TerminalTitleState } from "../terminalTitle.js"

const standardOutput = (): TerminalTitleOutput | undefined => (typeof process === "undefined" ? undefined : process.stdout)

export const useTerminalTitle = (state: TerminalTitleState): void => {
	const title = deriveTerminalTitle(state)
	const writer = useMemo(() => createTerminalTitleWriterForOutput(standardOutput()), [])

	useEffect(() => {
		writer?.(title)
	}, [title, writer])
}
