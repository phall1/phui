// === Check: dirty and stale ===
//
// Uncommitted work in a repository nobody has committed to in a while. Either
// half alone is normal — you are mid-edit, or a project is simply finished — so
// the check only fires on the conjunction, which is the shape of forgotten work.

import { defineCheck, makeFinding, type Finding } from "../types.js"
import { DAY_MS, MAJOR, describeAge, gitRepos, plural } from "./shared.js"

export const dirtyAndStaleCheck = defineCheck({
	id: "dirtyAndStale",
	title: "Dirty and stale",
	description: "Uncommitted changes in a repository whose last commit is older than the stale threshold.",
	defaultSeverity: MAJOR,
	requiresGitHub: false,
	run: (snapshots, ctx): readonly Finding[] => {
		const findings: Finding[] = []
		for (const snapshot of gitRepos(snapshots)) {
			const repo = snapshot.repo
			if (repo.dirtyCount <= 0) continue
			// No commit means no age to measure. A freshly-`git init`ed directory with
			// untracked files is a different (and far less interesting) situation.
			if (repo.lastCommitAt === null) continue

			const ageMs = ctx.now.getTime() - repo.lastCommitAt.getTime()
			// STRICTLY older than the threshold: a repo whose last commit is exactly
			// `staleDays` old is on the line, not over it.
			if (ageMs <= ctx.staleDays * DAY_MS) continue

			findings.push(
				makeFinding({
					checkId: "dirtyAndStale",
					severity: MAJOR,
					project: repo,
					title: "Dirty and stale",
					detail: `${plural(repo.dirtyCount, "uncommitted file")}, sitting untouched for ${describeAge(ageMs / DAY_MS)}`,
					suggestion: `Commit, stash or discard it: git -C ${repo.path} status --short`,
				}),
			)
		}
		return findings
	},
})
