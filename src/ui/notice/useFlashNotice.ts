import { useAtomSet as useAtomSetSolid } from "@effect/atom-solid"
import { onCleanup } from "solid-js"
import { useRef } from "../../solid-utils.js"
import { noticeAtom } from "./atoms.js"

const NOTICE_TIMEOUT_MS = 2500

export const useFlashNotice = (): ((message: string) => void) => {
	const setNotice = useAtomSetSolid(() => noticeAtom)
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	onCleanup(() => {
		if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
	})

	return (message: string) => {
		if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
		setNotice(message)
		timeoutRef.current = globalThis.setTimeout(() => {
			setNotice((current) => (current === message ? null : current))
		}, NOTICE_TIMEOUT_MS)
	}
}
