export type PeoplePromptAction = "add" | "remove"

export interface PeoplePrompt {
	readonly action: PeoplePromptAction
	readonly login: string
}

/** `kit` adds; `-kit` or `!kit` removes. Leading `@` is stripped. */
export const parsePeoplePrompt = (query: string): PeoplePrompt | null => {
	const trimmed = query.trim()
	if (trimmed.length === 0) return null
	const removing = trimmed.startsWith("-") || trimmed.startsWith("!")
	const login = (removing ? trimmed.slice(1) : trimmed).trim().replace(/^@/, "")
	if (login.length === 0) return null
	return { action: removing ? "remove" : "add", login }
}
