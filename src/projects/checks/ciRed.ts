// === Check: red CI on the default branch ===
//
// `GitHubSnapshot.latestRunConclusion` is already scoped to the default branch by
// the scanner, so this check is only a classification of that one value.
//
// Like aheadNoPr, it is SILENT without GitHub data. It is also silent on a null
// conclusion: upstream's `RunConclusion` uses null for "no run yet / still
// running / unknown", and an in-flight run is not a failure.

import type { RunConclusion } from "../../domain.js"
import { defineCheck, makeFinding, type Finding } from "../types.js"
import { MAJOR, ageInDays, describeAge, gitRepos } from "./shared.js"

/**
 * Conclusions that mean a human has to do something. Deliberately excludes
 * `cancelled`, `skipped`, `neutral` and `stale` — those are outcomes of how a run
 * was scheduled, not evidence that the default branch is broken.
 */
const failingConclusions = ["failure", "timed_out", "action_required"] as const

type FailingConclusion = (typeof failingConclusions)[number]

const conclusionLabels: Record<FailingConclusion, string> = {
	failure: "failed",
	timed_out: "timed out",
	action_required: "needs attention",
}

const isFailing = (conclusion: RunConclusion): conclusion is FailingConclusion => conclusion !== null && (failingConclusions as readonly string[]).includes(conclusion)

export const ciRedCheck = defineCheck({
	id: "ciRed",
	title: "CI red",
	description: "The latest workflow run on the default branch failed. Silent without GitHub data.",
	defaultSeverity: MAJOR,
	requiresGitHub: true,
	run: (snapshots, ctx): readonly Finding[] => {
		const findings: Finding[] = []
		for (const snapshot of gitRepos(snapshots)) {
			const github = snapshot.github
			// No remote facts, no verdict.
			if (github === undefined) continue
			if (!isFailing(github.latestRunConclusion)) continue

			const branch = github.defaultBranch ?? "the default branch"
			const when = github.latestRunAt === null ? "" : ` (${describeAge(ageInDays(github.latestRunAt, ctx.now))} ago)`

			findings.push(
				makeFinding({
					checkId: "ciRed",
					severity: MAJOR,
					project: snapshot.repo,
					title: "CI red",
					detail: `Latest run on ${branch} ${conclusionLabels[github.latestRunConclusion]}${when}`,
					suggestion: "Open the run to see what broke.",
					url: github.latestRunUrl,
				}),
			)
		}
		return findings
	},
})
