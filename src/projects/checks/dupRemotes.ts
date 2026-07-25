// === Check: duplicate remotes ===
//
// Two local directories pointing at the same "owner/repo". Usually an accidental
// second clone; occasionally a deliberate one that has since drifted. Either way
// it matters most when one of the copies has uncommitted work in it, because that
// is the copy whose changes get lost when the "spare" is deleted.
//
// WORKTREES ARE NOT CLONES. A repository and its linked worktrees share one
// config and therefore report the identical remote, and every one of them is
// discovered as a project in its own right when it sits under a scan root. So
// the snapshots are collapsed onto their common repository BEFORE grouping —
// otherwise the loudest finding on a worktree-heavy workspace is "this repo is
// cloned in 6 places", with a remedy that says to delete live worktrees.
//
// This is the one check that is about a SET of projects rather than a project, so
// it emits one finding per remote group: anchored on the alphabetically first
// directory, with the rest listed in `relatedPaths`.

import { defineCheck, makeFinding, type Finding, type ProjectSnapshot } from "../types.js"
import { MAJOR, MINOR, gitRepos } from "./shared.js"

/**
 * macOS resolves `/var` and `/tmp` through `/private`, so `git worktree list`
 * prints `/private/var/…` where the scanner recorded `/var/…`. Checks are pure
 * and synchronous by contract (no `realpath` available), and that prefix is the
 * only divergence in practice — stripping it makes the two agree.
 */
const canonicalPath = (path: string): string => {
	const stripped = path.startsWith("/private/") ? path.slice(8) : path
	return stripped.length > 1 ? stripped.replace(/\/+$/, "") : stripped
}

/**
 * The identity of the repository behind a snapshot, shared by all of its linked
 * worktrees: `git worktree list` reports the same set — main worktree first —
 * from every worktree of a repo, so the main worktree's path is a stable key.
 * Falls back to the directory itself when the worktree call gave us nothing.
 */
const commonRepoKey = (snapshot: ProjectSnapshot): string => canonicalPath(snapshot.repo.worktrees.find((worktree) => worktree.isMain)?.path ?? snapshot.repo.path)

/** One clone stands for its whole worktree set: the main worktree if we scanned it, else the first path. */
const representative = (members: readonly ProjectSnapshot[]): ProjectSnapshot => {
	const sorted = [...members].sort((a, b) => a.repo.path.localeCompare(b.repo.path))
	return sorted.find((member) => canonicalPath(member.repo.path) === commonRepoKey(member)) ?? sorted[0]!
}

interface Clone {
	readonly snapshot: ProjectSnapshot
	/** True when the clone OR any of its scanned worktrees has uncommitted work. */
	readonly dirty: boolean
}

/** Collapse the snapshots into one entry per distinct repository, keyed by remote. */
const clonesByRemote = (snapshots: readonly ProjectSnapshot[]): ReadonlyMap<string, readonly Clone[]> => {
	const byCommonRepo = new Map<string, ProjectSnapshot[]>()
	for (const snapshot of gitRepos(snapshots)) {
		// No remote (or a non-GitHub one the scanner could not normalize) means
		// there is no identity to collide on.
		if (snapshot.repo.remote === null) continue
		const key = commonRepoKey(snapshot)
		const group = byCommonRepo.get(key)
		if (group === undefined) byCommonRepo.set(key, [snapshot])
		else group.push(snapshot)
	}

	const byRemote = new Map<string, Clone[]>()
	for (const members of byCommonRepo.values()) {
		const snapshot = representative(members)
		const remote = snapshot.repo.remote
		if (remote === null) continue
		const clone: Clone = { snapshot, dirty: members.some((member) => member.repo.dirtyCount > 0) }
		const group = byRemote.get(remote)
		if (group === undefined) byRemote.set(remote, [clone])
		else group.push(clone)
	}
	return byRemote
}

export const dupRemotesCheck = defineCheck({
	id: "dupRemotes",
	title: "Duplicate clones",
	description: "More than one local clone tracking the same remote repository (linked worktrees do not count).",
	defaultSeverity: MINOR,
	requiresGitHub: false,
	run: (snapshots): readonly Finding[] => {
		const findings: Finding[] = []
		// Sorted twice — by remote, then by path within a remote — so both the
		// finding order and the anchor of each finding are stable across rescans.
		for (const [remote, group] of [...clonesByRemote(snapshots).entries()].sort(([a], [b]) => a.localeCompare(b))) {
			if (group.length < 2) continue
			const members = [...group].sort((a, b) => a.snapshot.repo.path.localeCompare(b.snapshot.repo.path))
			const anchor = members[0]!.snapshot.repo
			const dirtyCount = members.filter((member) => member.dirty).length
			const names = members.map((member) => member.snapshot.repo.name).join(", ")

			findings.push(
				makeFinding({
					checkId: "dupRemotes",
					severity: dirtyCount > 0 ? MAJOR : MINOR,
					project: anchor,
					// Keyed by remote rather than by anchor path: the group's identity is
					// the remote, and the anchor can change when a directory is removed.
					discriminator: remote,
					title: "Duplicate clones",
					detail:
						dirtyCount > 0
							? `${remote} is cloned in ${members.length} places (${names}); ${dirtyCount} of them have uncommitted changes`
							: `${remote} is cloned in ${members.length} places (${names})`,
					suggestion: dirtyCount > 0 ? "Reconcile the copies with uncommitted work before deleting any of them." : "Keep one clone and remove the rest.",
					relatedPaths: members.slice(1).map((member) => member.snapshot.repo.path),
				}),
			)
		}
		return findings
	},
})
