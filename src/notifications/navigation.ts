// === Inbox: the navigation bridge ===
//
// The Inbox's whole reason to exist is that `enter` lands you on the thing
// itself, in phui, rather than in a browser tab. Doing that needs machinery
// that lives in `useAppShell` (repository scope, PR hydration, list selection),
// which a fork-owned surface should not be reaching into directly.
//
// So the direction is inverted, exactly like `src/projects/keymap.ts` does for
// its view handle: the App shell publishes a small function table here on
// mount, and the Inbox calls it. Nothing upstream has to know the Inbox exists
// beyond one `useEffect`, and when the shell is unmounted the navigator is null
// and the Inbox falls back to the browser instead of acting on a stale closure.

export interface InboxTarget {
	readonly repository: string
	readonly number: number
}

export interface InboxNavigator {
	/** Scope to the repository, hydrate the PR, select it, and open its detail view. */
	readonly openPullRequest: (target: InboxTarget) => Promise<void>
	/** Scope to the repository and show its Issues surface. */
	readonly openIssue: (target: InboxTarget) => void
	readonly openRepository: (repository: string) => void
}

let mounted: InboxNavigator | null = null

export const setInboxNavigator = (navigator: InboxNavigator): void => {
	mounted = navigator
}

/**
 * Identity-guarded teardown. Tests mount several Apps in one process, and an
 * unconditional clear would let the first shell's cleanup null out the second
 * shell's navigator — leaving `enter` silently falling back to the browser.
 */
export const clearInboxNavigator = (navigator: InboxNavigator): void => {
	if (mounted === navigator) mounted = null
}

export const inboxNavigator = (): InboxNavigator | null => mounted
