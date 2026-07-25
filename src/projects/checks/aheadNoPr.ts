// === Check: ahead with no pull request ===
//
// Local commits that exist nowhere else and have no open PR to carry them.
//
// THE CORRECTNESS RULE FOR THIS FILE: "there is no open PR" is a claim that can
// only be made from COMPLETE PR data. This check is SILENT whenever the evidence
// is partial — no `gh`, not signed in, offline, fetch failed, the open-PR list
// came back truncated, or one of the clone's remotes (a fork's `upstream`, where
// a cross-fork PR's base actually lives) was not fetched. Reporting then would
// turn branches into false positives at exactly the moment the user can least
// verify them. Absence of evidence is not evidence of absence — see
// `hasCompletePullRequestEvidence`.

import { defineCheck, hasCompletePullRequestEvidence, makeFinding, openPullRequestForBranch, type Finding } from "../types.js"
import { MAJOR, gitRepos, plural } from "./shared.js"

export const aheadNoPrCheck = defineCheck({
	id: "aheadNoPr",
	title: "Ahead with no PR",
	description: "Commits ahead of the upstream on a branch with no open pull request. Silent without GitHub data.",
	defaultSeverity: MAJOR,
	requiresGitHub: true,
	run: (snapshots): readonly Finding[] => {
		const findings: Finding[] = []
		for (const snapshot of gitRepos(snapshots)) {
			// The degradation contract. Do not move this below any other condition:
			// without complete PR data there is nothing this check is entitled to say.
			if (snapshot.github === undefined || !hasCompletePullRequestEvidence(snapshot)) continue

			const repo = snapshot.repo
			if (repo.ahead <= 0) continue
			// A detached HEAD has no branch a PR could be opened from, and `ahead` is
			// meaningless without a branch to compare.
			if (repo.detachedHead || repo.currentBranch === null) continue
			if (openPullRequestForBranch(snapshot, repo.currentBranch) !== null) continue

			// On the default branch there is nothing to open a PR *from* — the same
			// facts mean "you never pushed", so only the remedy changes.
			const onDefaultBranch = snapshot.github.defaultBranch !== null && snapshot.github.defaultBranch === repo.currentBranch
			const upstream = repo.upstreamRef ?? "the remote"
			// `--repo` is only unambiguous with a single GitHub remote. On a fork
			// checkout `gh` resolves the base repository from the clone itself, and
			// naming the fork would open the PR against the wrong base.
			const target = repo.githubRemotes.length > 1 ? "" : ` --repo ${snapshot.github.repository}`

			findings.push(
				makeFinding({
					checkId: "aheadNoPr",
					severity: MAJOR,
					project: repo,
					title: onDefaultBranch ? "Unpushed commits" : "Ahead with no PR",
					detail: `${plural(repo.ahead, "commit")} ahead of ${upstream} on ${repo.currentBranch}, with no open pull request`,
					suggestion: onDefaultBranch ? `Push it: git -C ${repo.path} push` : `Open one: gh pr create${target} --head ${repo.currentBranch}`,
				}),
			)
		}
		return findings
	},
})
