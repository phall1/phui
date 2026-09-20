import { Effect } from "effect"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { readMaybeAccessor, type MaybeAccessor } from "../solid-utils.js"
import { readWorkspacePreferencesFile, writeWorkspacePreferencesFile } from "../workspacePreferenceFile.js"
import { makeWorkspacePreferences, repositoryId, viewerId, type WorkspacePreferences } from "../workspacePreferences.js"

const MAX_RECENT_REPOSITORIES = 20

export interface UseWorkspacePreferencesPersistenceInput {
	readonly username: MaybeAccessor<string | null>
	readonly favoriteRepositories: MaybeAccessor<Record<string, true>>
	readonly recentRepositories: MaybeAccessor<readonly string[]>
	readonly mockPath: MaybeAccessor<string | null>
	readonly readPreferences: (viewer: ReturnType<typeof viewerId>) => Promise<WorkspacePreferences | null | undefined>
	readonly writePreferences: (preferences: WorkspacePreferences) => Promise<unknown>
	readonly setFavoriteRepositories: (next: Record<string, true>) => void
	readonly setRecentRepositories: (next: readonly string[]) => void
}

/**
 * On username change, loads stored workspace preferences (favorites + recent
 * repositories) and applies them. Once load completes, persists changes back
 * to storage whenever favorites or recents change. The mock path branch reads
 * and writes via a JSON file instead of the cache service.
 */
export const useWorkspacePreferencesPersistence = (input: UseWorkspacePreferencesPersistenceInput): void => {
	const [loadedViewer, setLoadedViewer] = createSignal<string | null>(null)

	createEffect(() => {
		const username = readMaybeAccessor(input.username)
		if (!username) return
		let cancelled = false
		const viewer = viewerId(username)
		setLoadedViewer(null)
		const mockPath = readMaybeAccessor(input.mockPath)
		const loadPreferences = mockPath ? Effect.runPromise(readWorkspacePreferencesFile(mockPath, viewer)) : input.readPreferences(viewer)
		void loadPreferences
			.then((preferences) => {
				if (cancelled) return
				if (preferences) {
					input.setFavoriteRepositories(Object.fromEntries(preferences.favoriteRepositories.map((repository) => [repository, true])))
					input.setRecentRepositories(preferences.recentRepositories)
				}
				setLoadedViewer(username)
			})
			.catch(() => {
				// Do not enable writes after a failed read: writing the startup
				// defaults here would overwrite persisted favorites and recents.
			})
		onCleanup(() => {
			cancelled = true
		})
	})

	createEffect(() => {
		const username = readMaybeAccessor(input.username)
		if (!username || loadedViewer() !== username) return
		const favoriteRepositories = readMaybeAccessor(input.favoriteRepositories)
		const recentRepositories = readMaybeAccessor(input.recentRepositories)
		const preferences = makeWorkspacePreferences({
			viewer: viewerId(username),
			favoriteRepositories: Object.keys(favoriteRepositories).map(repositoryId),
			recentRepositories: recentRepositories.map(repositoryId).slice(0, MAX_RECENT_REPOSITORIES),
		})
		const mockPath = readMaybeAccessor(input.mockPath)
		const savePreferences = mockPath ? Effect.runPromise(writeWorkspacePreferencesFile(mockPath, preferences)) : input.writePreferences(preferences)
		void savePreferences.catch(() => undefined)
	})
}
