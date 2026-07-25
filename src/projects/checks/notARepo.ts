// === Check: not a repository ===
//
// A directory sitting under a configured scan root with no git repository in it.
// Sometimes that is a scratch folder that should be excluded; sometimes it is
// real work that was never put under version control. Minor either way — the
// point is to make the user decide once, then never see it again.

import { defineCheck, makeFinding, type Finding } from "../types.js"
import { MINOR, isInspectable, isNaggable } from "./shared.js"

export const notARepoCheck = defineCheck({
	id: "notARepo",
	title: "Not a repository",
	description: "A directory under a scan root that is not a git repository.",
	defaultSeverity: MINOR,
	requiresGitHub: false,
	run: (snapshots, ctx): readonly Finding[] => {
		const findings: Finding[] = []
		for (const snapshot of snapshots) {
			// A scan error also leaves `isGitRepo` false, but "we could not look"
			// is not the same claim as "there is no repository here".
			if (!isInspectable(snapshot) || !isNaggable(snapshot)) continue
			const repo = snapshot.repo
			if (repo.isGitRepo) continue

			findings.push(
				makeFinding({
					checkId: "notARepo",
					severity: MINOR,
					project: repo,
					title: "Not a repository",
					detail: `${repo.name} sits under ${repo.scanRoot} but is not a git repository`,
					suggestion:
						ctx.configPath === null
							? `Run git init, or add "${repo.name}" to exclude in your projects.toml.`
							: `Run git init, or add "${repo.name}" to exclude in ${ctx.configPath}.`,
				}),
			)
		}
		return findings
	},
})
