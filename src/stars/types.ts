// === Stars: domain ===

export interface StarredRepository {
	readonly repository: string
	readonly owner: string
	readonly name: string
	readonly description: string | null
	readonly language: string | null
	readonly stars: number
	readonly forks: number
	readonly topics: readonly string[]
	readonly archived: boolean
	readonly fork: boolean
	readonly pushedAt: Date | null
	readonly starredAt: Date | null
	readonly url: string
}

export const starsSortModes = ["starred", "pushed", "stars", "name"] as const
export type StarsSortMode = (typeof starsSortModes)[number]

export const starsSortLabels: Record<StarsSortMode, string> = {
	starred: "recently starred",
	pushed: "recently pushed",
	stars: "most stars",
	name: "name",
}

export const nextStarsSortMode = (mode: StarsSortMode): StarsSortMode => starsSortModes[(starsSortModes.indexOf(mode) + 1) % starsSortModes.length]!

const time = (value: Date | null) => value?.getTime() ?? 0

export const sortStarredRepositories = (items: readonly StarredRepository[], mode: StarsSortMode): readonly StarredRepository[] => {
	const sorted = [...items]
	if (mode === "starred") sorted.sort((a, b) => time(b.starredAt) - time(a.starredAt))
	else if (mode === "pushed") sorted.sort((a, b) => time(b.pushedAt) - time(a.pushedAt))
	else if (mode === "stars") sorted.sort((a, b) => b.stars - a.stars)
	else sorted.sort((a, b) => a.repository.localeCompare(b.repository))
	return sorted
}

/**
 * Substring match across the fields you would actually type: the full name, the
 * description, the language, and the topics. Deliberately not fuzzy — with a
 * few hundred rows a plain substring is predictable, and predictability is what
 * makes an incremental filter usable at typing speed.
 */
export const matchesStarQuery = (item: StarredRepository, query: string): boolean => {
	const needle = query.trim().toLowerCase()
	if (needle.length === 0) return true
	if (item.repository.toLowerCase().includes(needle)) return true
	if (item.description?.toLowerCase().includes(needle) === true) return true
	if (item.language?.toLowerCase().includes(needle) === true) return true
	return item.topics.some((topic) => topic.toLowerCase().includes(needle))
}

export interface StarsReport {
	readonly items: readonly StarredRepository[]
	readonly fetchedAt: Date
	/** True when the page cap stopped the fetch before GitHub ran out of stars. */
	readonly truncated: boolean
	readonly warnings: readonly string[]
}

export const emptyStarsReport = (fetchedAt: Date, warnings: readonly string[] = []): StarsReport => ({ items: [], fetchedAt, truncated: false, warnings })

export const formatStarCount = (stars: number): string => {
	if (stars < 1000) return String(stars)
	if (stars < 10_000) return `${(stars / 1000).toFixed(1)}k`
	return `${Math.round(stars / 1000)}k`
}
