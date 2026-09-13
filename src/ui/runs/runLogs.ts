/** Wrap `gh run view --log` text to the pane width so the runs view can scroll it. */
export const wrapRunLogText = (text: string, width: number): readonly string[] => {
	const safeWidth = Math.max(1, width)
	const source = text.replace(/\r/g, "").trimEnd()
	if (source.length === 0) return ["No failed-job logs."]
	return source.split("\n").flatMap((line) => {
		if (line.length === 0) return [""]
		const chunks: string[] = []
		for (let index = 0; index < line.length; index += safeWidth) chunks.push(line.slice(index, index + safeWidth))
		return chunks
	})
}

export const updateBranchConflictNotice = (error: string): string | null => {
	const lower = error.toLowerCase()
	if (lower.includes("conflict") || lower.includes("not mergeable") || lower.includes("merge conflict")) {
		return "Branch has conflicts. Resolve in the editor (e) or a worktree (w)."
	}
	return null
}
