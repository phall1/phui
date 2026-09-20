import { useAtomSet as useAtomSetSolid, useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { createEffect, createMemo, onCleanup, untrack, type Accessor } from "solid-js"
import type { RepositoryDetails } from "../../domain.js"
import { fetchRepositoryDetailsAtom, readCachedRepositoryDetailsAtom, repositoryDetailsCacheAtom, writeRepositoryDetailsAtom } from "./atoms.js"

/**
 * Returns repository metadata (description, stars, open PR/issue counts,
 * etc.) for the given repo, hydrating the in-memory cache from SQLite first
 * and then refreshing from GitHub. Returns `null` while the cache is empty.
 *
 * Both writes (SQLite + in-memory) happen unconditionally on successful
 * fetch; the SQLite read is best-effort and only used to show last-known
 * data immediately while the network call lands.
 */
export const useRepositoryDetails = (repository: Accessor<string | null>): Accessor<RepositoryDetails | null> => {
	const cache = useAtomValueSolid(() => repositoryDetailsCacheAtom)
	const setCache = useAtomSetSolid(() => repositoryDetailsCacheAtom)
	const readCached = useAtomSetSolid(() => readCachedRepositoryDetailsAtom, { mode: "promise" })
	const fetchDetails = useAtomSetSolid(() => fetchRepositoryDetailsAtom, { mode: "promise" })
	const writeCached = useAtomSetSolid(() => writeRepositoryDetailsAtom, { mode: "promise" })

	const cached = createMemo(() => {
		const repo = repository()
		return repo ? (cache()[repo] ?? null) : null
	})

	createEffect(() => {
		const repo = repository()
		if (!repo) return
		let cancelled = false
		onCleanup(() => {
			cancelled = true
		})
		void (async () => {
			if (!untrack(() => cache()[repo])) {
				const fromDisk = await readCached(repo).catch(() => null)
				if (cancelled) return
				if (fromDisk) setCache((current) => (current[repo] ? current : { ...current, [repo]: fromDisk }))
			}
			try {
				const fresh = await fetchDetails(repo)
				if (cancelled) return
				setCache((current) => ({ ...current, [repo]: fresh }))
				void writeCached(fresh).catch(() => {})
			} catch {
				// Fall back to whatever's already in the cache.
			}
		})()
	})

	return cached
}
