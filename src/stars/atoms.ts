import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { githubRuntime, mockPrCount } from "../services/runtime.js"
import { listStarredRepositories, unstarRepository } from "./github.js"
import { mockStarsReport } from "./mock.js"
import type { StarsSortMode } from "./types.js"

/** Cursor into the currently rendered rows. Survives tab switches. */
export const starsSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)

export const starsSortAtom = Atom.make<StarsSortMode>("starred").pipe(Atom.keepAlive)

/** Bumped by `r`; the report atom reads it to re-fetch. */
export const starsRefreshAtom = Atom.make(0).pipe(Atom.keepAlive)

/**
 * Optimistically unstarred repositories, cleared when the next fetch lands.
 * Same reasoning as the Inbox's dismissal overlay: an unstar is a round trip,
 * and re-fetching several hundred rows to make one disappear would stall the
 * list mid-triage.
 */
export const starsRemovedAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive)

/**
 * The starred list. `E = never` by contract — see ./github.ts — so partial
 * failure reaches the user through `warnings` rather than an error boundary.
 * `keepAlive` because the fetch is up to five requests; it should survive a tab
 * switch and refresh only when asked.
 */
export const starsReportAtom = githubRuntime
	.atom(
		Effect.fnUntraced(function* (get) {
			get(starsRefreshAtom)
			const now = new Date()
			if (mockPrCount !== null) return mockStarsReport(now)
			return yield* listStarredRepositories(now)
		}),
	)
	.pipe(Atom.keepAlive)

export const unstarRepositoryAtom = githubRuntime.fn<string>()((repository) => unstarRepository(repository))
