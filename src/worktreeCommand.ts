import { isAbsolute, normalize, relative, sep } from "node:path"
import { type EditorCommandFields, expandHome, renderEditorCommand } from "./editorCommand.js"

/**
 * Pure helpers for the "open PR in a phux worktree" feature: worktree-path
 * template rendering, branch / session naming, and phux-environment
 * detection. The `WorktreeOpener` service owns the actual git + phux
 * subprocesses; everything here is unit-testable in isolation.
 */

export const defaultWorktreePathTemplate = "{{repoPath}}/.ghui/worktrees/pr-{{number}}"

/** Render the worktree location template (same `{{...}}` tokens as `editorCommand`). */
export const renderWorktreePath = (template: string, fields: EditorCommandFields, repoPath: string): string =>
	normalize(expandHome(renderEditorCommand(template, fields, repoPath)))

/** Local branch checked out in the worktree; namespaced so it never collides with real branches. */
export const worktreeBranchName = (number: number): string => `pr/${number}`

/**
 * phux session name for a PR: `<repo>-pr-<number>` with anything outside
 * `[A-Za-z0-9_-]` collapsed to `-` (phux selectors use `:` and `.`, so those
 * must never appear in a session name).
 */
export const phuxSessionName = (fields: EditorCommandFields): string => {
	const name = fields.repository.split("/")[1] ?? fields.repository
	return `${name}-pr-${fields.number}`.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
}

/** True when ghui itself is running inside a phux pane. */
export const isInsidePhux = (env: Record<string, string | undefined>): boolean => typeof env.PHUX_TERMINAL_ID === "string" && env.PHUX_TERMINAL_ID.length > 0

/**
 * When the worktree lives inside the clone, the entry to append to
 * `.git/info/exclude` so worktrees never show up in `git status` — the
 * top-level directory segment (e.g. `.ghui/`). Null when the worktree is
 * outside the repo (nothing to exclude).
 */
export const worktreeExcludeEntry = (repoPath: string, worktreePath: string): string | null => {
	const rel = relative(normalize(repoPath), normalize(worktreePath))
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null
	const top = rel.split(sep)[0]
	return top ? `${top}/` : null
}
