import { useAtomSet as useAtomSetSolid, useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { createEffect, createMemo } from "solid-js"
import { readMaybeAccessor, useRef, type MaybeAccessor, type MutableRefObject } from "../solid-utils.js"
import type { AppCommand } from "../commands.js"
import { clampCommandIndex, type CommandScope, commandEnabled, defineCommand, filterCommands, sortCommandsByActiveScope } from "../commands.js"
import { commandSnapshotsAtom } from "../commands/atoms.js"
import { dispatchCommandAtom } from "../commands/dispatch.js"
import { commandRuntimeAtom } from "../commands/runtimeAtom.js"
import { canEditComment } from "../ui/comments/useCommentMutations.js"
import type { PullRequestComment } from "../domain.js"
import type { PullRequestView } from "../pullRequestViews.js"
import { parseRepositoryInput } from "../pullRequestViews.js"

interface CommandPaletteShape {
	readonly query: string
	readonly selectedIndex: number
}

interface CommandRuntimeSnapshot {
	readonly readyDiffFileCount: number
	readonly diffFileIndex: number
	readonly selectedDiffCommentAnchorLabel: string | null
	readonly selectedDiffCommentThreadCount: number
	readonly hasDiffCommentThreads: boolean
	readonly diffRangeActive: boolean
	readonly selectedCommentsStatus: "idle" | "loading" | "ready" | "error"
	readonly selectedOrderedComment: PullRequestComment | null
	readonly username: string | null
}

export interface UseCommandRegistryInput {
	readonly commandPaletteActive: boolean
	readonly commandPalette: CommandPaletteShape
	readonly selectedRepository: string | null
	readonly switchViewTo: (view: PullRequestView) => void
	readonly commentsViewActive: boolean
	readonly diffFullView: boolean
	readonly detailFullView: boolean
	readonly runtimeSnapshot: MaybeAccessor<CommandRuntimeSnapshot>
}

export interface CommandRegistry {
	readonly appCommands: readonly AppCommand[]
	readonly commandPaletteCommands: readonly AppCommand[]
	readonly selectedCommandIndex: number
	readonly selectedCommand: AppCommand | null
	readonly runCommand: (command: AppCommand, options?: { readonly notifyDisabled?: boolean; readonly closePalette?: boolean }) => boolean
	readonly runCommandById: (id: string, options?: { readonly notifyDisabled?: boolean }) => boolean
	readonly runCommandByIdRef: MutableRefObject<(id: string, options?: { readonly notifyDisabled?: boolean }) => boolean>
}

export interface UseCommandRegistryFlow extends CommandRegistry {
	readonly closeActiveModal: () => void
	readonly flashNotice: (msg: string) => void
}

/**
 * Wraps the new-style command registry: snapshot atoms → AppCommand[] →
 * fuzzy-filtered palette list. Also keeps `commandRuntimeAtom` in sync
 * with the per-render computed values that derivation atoms consult.
 *
 * `runCommandById` is exposed via ref so callers downstream can fire
 * a command without re-running the effect that installs them.
 */
export const useCommandRegistry = (input: UseCommandRegistryInput & { readonly closeActiveModal: () => void; readonly flashNotice: (msg: string) => void }): CommandRegistry => {
	const dispatchCommand = useAtomSetSolid(() => dispatchCommandAtom, { mode: "promise" })
	const commandSnapshots = useAtomValueSolid(() => commandSnapshotsAtom)
	const registeredCommands = createMemo<readonly AppCommand[]>(() =>
		commandSnapshots().map((snapshot) => ({
			id: snapshot.id,
			title: snapshot.title,
			scope: snapshot.scope,
			...(snapshot.subtitle !== undefined && { subtitle: snapshot.subtitle }),
			...(snapshot.shortcut !== undefined && { shortcut: snapshot.shortcut }),
			...(snapshot.keywords !== undefined && { keywords: snapshot.keywords }),
			disabledReason: snapshot.disabledReason,
			run: () => {
				void dispatchCommand(snapshot.id)
			},
		})),
	)

	const setCommandRuntime = useAtomSetSolid(() => commandRuntimeAtom)
	createEffect(() => {
		const runtimeSnapshot = readMaybeAccessor(input.runtimeSnapshot)
		setCommandRuntime({
			readyDiffFileCount: runtimeSnapshot.readyDiffFileCount,
			diffFileIndex: runtimeSnapshot.diffFileIndex,
			selectedDiffCommentAnchorLabel: runtimeSnapshot.selectedDiffCommentAnchorLabel,
			selectedDiffCommentThreadCount: runtimeSnapshot.selectedDiffCommentThreadCount,
			hasDiffCommentThreads: runtimeSnapshot.hasDiffCommentThreads,
			diffRangeActive: runtimeSnapshot.diffRangeActive,
			hasSelectedComment:
				runtimeSnapshot.selectedCommentsStatus !== "idle" && runtimeSnapshot.selectedCommentsStatus !== "loading" && runtimeSnapshot.selectedOrderedComment !== null,
			canEditSelectedComment: canEditComment(runtimeSnapshot.selectedOrderedComment, runtimeSnapshot.username),
		})
	})

	const appCommands = registeredCommands()
	const runCommand = (command: AppCommand, options: { readonly notifyDisabled?: boolean; readonly closePalette?: boolean } = {}) => {
		if (!commandEnabled(command)) {
			if (options.notifyDisabled && command.disabledReason) input.flashNotice(command.disabledReason)
			return false
		}
		if (options.closePalette) input.closeActiveModal()
		command.run()
		return true
	}
	const runCommandById = (id: string, options: { readonly notifyDisabled?: boolean } = {}) => {
		const command = appCommands.find((entry) => entry.id === id)
		return command ? runCommand(command, options) : false
	}
	const runCommandByIdRef = useRef(runCommandById)
	runCommandByIdRef.current = runCommandById

	const dynamicPaletteCommands: readonly AppCommand[] = (() => {
		if (!input.commandPaletteActive) return []
		const repository = parseRepositoryInput(input.commandPalette.query)
		if (!repository || repository === input.selectedRepository) return []
		return [
			defineCommand({
				id: `view.repository.dynamic:${repository}`,
				title: `Open ${repository}`,
				scope: "View",
				subtitle: "Switch to this repository",
				run: () => input.switchViewTo({ _tag: "Repository", repository }),
			}),
		]
	})()
	const staticPaletteCommands = input.commandPaletteActive
		? filterCommands(
				appCommands.filter((command) => command.id !== "command.open" && commandEnabled(command)),
				input.commandPalette.query,
			)
		: []
	const activePaletteScope: CommandScope | null = input.commentsViewActive ? "Comments" : input.diffFullView ? "Diff" : input.detailFullView ? "View" : null
	const commandPaletteCommands = input.commandPaletteActive
		? [...dynamicPaletteCommands, ...(input.commandPalette.query.trim().length > 0 ? staticPaletteCommands : sortCommandsByActiveScope(staticPaletteCommands, activePaletteScope))]
		: []
	const selectedCommandIndex = clampCommandIndex(input.commandPalette.selectedIndex, commandPaletteCommands)
	const selectedCommand = commandPaletteCommands[selectedCommandIndex] ?? null

	return { appCommands, commandPaletteCommands, selectedCommandIndex, selectedCommand, runCommand, runCommandById, runCommandByIdRef }
}
