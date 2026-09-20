import { useAtomSet as useAtomSetSolid, useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { createMemo, type Accessor } from "solid-js"
import type { IssueItem, PullRequestItem, RepositoryDetails } from "../../domain.js"
import { repositoryFilterScore } from "../../ui/filter/scoring.js"
import { useRepositoryDetails } from "../../ui/pullRequests/useRepositoryDetails.js"
import type { RepositoryListItem } from "../../ui/RepoList.js"
import { useClampedIndex } from "../../ui/useClampedIndex.js"
import { buildRepositoryItems, type CatalogEntry } from "../../workspace/repositoryItems.js"
import { favoriteRepositoriesAtom, recentRepositoriesAtom, repoRollupAtom, selectedRepositoryIndexAtom } from "../../workspace/atoms.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"
import type { RepoRollupRow } from "../../services/CacheService.js"

// Match the polymorphic setter: accepts either a value or an updater.
type SetState<T> = (next: T | ((prev: T) => T)) => void

export interface UseRepoSurfaceInput {
	readonly pullRequests: readonly PullRequestItem[]
	readonly allIssues: readonly IssueItem[]
	readonly visibleFilterText: string
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly detectedRepository: string | null
	readonly mockRepositoryCatalog: readonly CatalogEntry[]
	readonly flashNotice: (message: string) => void
}

export interface RepoSurfaceActions {
	readonly toggleFavoriteRepository: () => void
	readonly removeSelectedRepository: () => void
}

export interface RepoSurfaceShell {
	readonly isFullscreen: false
	readonly repositoryItems: Accessor<readonly RepositoryListItem[]>
	readonly selectedRepositoryItem: Accessor<RepositoryListItem | null>
	readonly selectedRepositoryDetails: Accessor<RepositoryDetails | null>
	readonly selectedRepositoryIndex: Accessor<number>
	readonly setSelectedRepositoryIndex: SetState<number>
	readonly favoriteRepositories: Accessor<Readonly<Record<string, true>>>
	readonly setFavoriteRepositories: SetState<Readonly<Record<string, true>>>
	readonly recentRepositories: Accessor<readonly string[]>
	readonly setRecentRepositories: SetState<readonly string[]>
	readonly repoRollup: Accessor<readonly RepoRollupRow[]>
	readonly setRepoRollup: (next: readonly RepoRollupRow[]) => void
	readonly actions: RepoSurfaceActions
}

// Repo Surface shell. Owns the repository list derivation, the in-flight
// repository-details fetch, selection clamping, and the repo-specific
// favorite/remove actions. Everything reactive is returned as an accessor.
export const useRepoSurface = (input: UseRepoSurfaceInput): RepoSurfaceShell => {
	const { pullRequests, allIssues, visibleFilterText, activeWorkspaceSurface, detectedRepository, mockRepositoryCatalog, flashNotice } = input

	const selectedRepositoryIndex = useAtomValueSolid(() => selectedRepositoryIndexAtom)
	const setSelectedRepositoryIndex = useAtomSetSolid(() => selectedRepositoryIndexAtom)
	const favoriteRepositories = useAtomValueSolid(() => favoriteRepositoriesAtom)
	const setFavoriteRepositories = useAtomSetSolid(() => favoriteRepositoriesAtom)
	const recentRepositories = useAtomValueSolid(() => recentRepositoriesAtom)
	const setRecentRepositories = useAtomSetSolid(() => recentRepositoriesAtom)
	const repoRollup = useAtomValueSolid(() => repoRollupAtom)
	const setRepoRollup = useAtomSetSolid(() => repoRollupAtom)

	const allRepositoryItems = createMemo((): readonly RepositoryListItem[] =>
		buildRepositoryItems({
			recentRepositories: recentRepositories(),
			favoriteRepositories: favoriteRepositories(),
			detectedRepository,
			repoRollup: repoRollup(),
			pullRequests,
			allIssues,
			mockRepositoryCatalog,
		}),
	)
	const repositoryItems = createMemo(() =>
		activeWorkspaceSurface === "repos" ? allRepositoryItems().filter((repository) => repositoryFilterScore(repository, visibleFilterText) !== null) : allRepositoryItems(),
	)
	const selectedRepositoryItem = createMemo(() => repositoryItems()[Math.max(0, Math.min(selectedRepositoryIndex(), repositoryItems().length - 1))] ?? null)
	const selectedRepositoryDetails = useRepositoryDetails(() => selectedRepositoryItem()?.repository ?? null)

	useClampedIndex(() => repositoryItems().length, setSelectedRepositoryIndex)

	const toggleFavoriteRepository = () => {
		const item = selectedRepositoryItem()
		if (!item) return
		const repository = item.repository
		setFavoriteRepositories((current) => {
			if (current[repository]) {
				const next = { ...current }
				delete next[repository]
				return next
			}
			return { ...current, [repository]: true }
		})
	}

	const removeSelectedRepository = () => {
		const item = selectedRepositoryItem()
		if (!item) return
		const repository = item.repository
		setFavoriteRepositories((current) => {
			if (!current[repository]) return current
			const next = { ...current }
			delete next[repository]
			return next
		})
		setRecentRepositories((current) => current.filter((entry) => entry !== repository))
		flashNotice(repository === detectedRepository ? `Removed saved state for ${repository}; current repo stays pinned` : `Removed ${repository} from tracked repositories`)
	}

	return {
		isFullscreen: false,
		repositoryItems,
		selectedRepositoryItem,
		selectedRepositoryDetails,
		selectedRepositoryIndex,
		setSelectedRepositoryIndex,
		favoriteRepositories,
		setFavoriteRepositories,
		recentRepositories,
		setRecentRepositories,
		repoRollup,
		setRepoRollup,
		actions: {
			toggleFavoriteRepository,
			removeSelectedRepository,
		},
	}
}
