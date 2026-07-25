// === Check: stale worktrees ===
//
// Worktrees git itself already considers prunable, plus ones whose directory has
// vanished. The scanner copies git's verdict straight out of
// `git worktree list --porcelain`, so this check never re-derives it — it only
// decides which of those verdicts are worth showing.
//
// One finding per worktree (discriminated by worktree path), because the remedy
// is per-worktree and the user needs to see which one.
//
// A linked worktree is discovered by the scanner as a project in its own right
// whenever it happens to sit under a scan root, and `git worktree list` reports
// the SAME set from every one of them. Reporting per-snapshot would therefore
// emit the identical stale worktree once per sibling; the check dedupes on
// worktree path so the user sees it once, anchored on the first project in scan
// order (a deterministic walk, so the anchor is stable across rescans).

import { defineCheck, makeFinding, type Finding } from "../types.js"
import { MINOR, gitRepos } from "./shared.js"

export const staleWorktreesCheck = defineCheck({
	id: "staleWorktrees",
	title: "Stale worktree",
	description: "A linked worktree git reports as prunable, or whose directory no longer exists.",
	defaultSeverity: MINOR,
	requiresGitHub: false,
	run: (snapshots): readonly Finding[] => {
		const findings: Finding[] = []
		const reported = new Set<string>()
		for (const snapshot of gitRepos(snapshots)) {
			const repo = snapshot.repo
			for (const worktree of repo.worktrees) {
				// The main worktree is the repository itself; it is never a cleanup target.
				if (worktree.isMain) continue
				// Already reported via a sibling that shares this worktree list.
				if (reported.has(worktree.path)) continue
				// A locked worktree was pinned on purpose (removable media, a long-running
				// experiment). git refuses to prune it and so do we.
				if (worktree.isLocked) continue
				if (!worktree.isPrunable && !worktree.isMissing) continue

				const reason = worktree.isMissing
					? "its directory no longer exists"
					: worktree.prunableReason !== null && worktree.prunableReason.length > 0
						? worktree.prunableReason
						: "git reports it as prunable"
				const branch = worktree.branch === null ? "" : ` (${worktree.branch})`

				reported.add(worktree.path)
				findings.push(
					makeFinding({
						checkId: "staleWorktrees",
						severity: MINOR,
						project: repo,
						discriminator: worktree.path,
						title: "Stale worktree",
						detail: `${worktree.path}${branch}: ${reason}`,
						suggestion: `git -C ${repo.path} worktree prune`,
					}),
				)
			}
		}
		return findings
	},
})
