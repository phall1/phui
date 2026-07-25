import { checkById, projectChecks } from "./checks/index.js"
import type { CheckId, Finding, FindingSeverity, ProjectSnapshot, ProjectsReport } from "./types.js"

// Pure row model for the Projects surface. Everything the view renders is a
// flat list of height-1 rows so the cursor index and the scroll offset are the
// same number, and so this file stays testable without a renderer.

export type ProjectsRowTone = "muted" | "warning"

export type ProjectsRow =
	| { readonly kind: "heading"; readonly key: string; readonly text: string; readonly count: number; readonly severity: FindingSeverity }
	| { readonly kind: "finding"; readonly key: string; readonly finding: Finding; readonly text: string }
	| { readonly kind: "project"; readonly key: string; readonly project: ProjectSnapshot; readonly findingCount: number }
	| { readonly kind: "note"; readonly key: string; readonly text: string; readonly tone: ProjectsRowTone }
	| { readonly kind: "blank"; readonly key: string }

export interface ProjectsRows {
	readonly rows: readonly ProjectsRow[]
	/** Indices into `rows` the cursor may land on, in visual order. */
	readonly selectable: readonly number[]
}

export interface FindingGroup {
	readonly checkId: CheckId
	readonly title: string
	readonly findings: readonly Finding[]
}

/**
 * Group findings by check, preserving the order they arrive in.
 *
 * `ProjectsReport.findings` is already sorted most-severe-first, so grouping on
 * first appearance puts the group containing the worst finding at the top
 * without a second sort — and keeps ties in the checks' own deterministic
 * order.
 */
export const groupFindings = (findings: readonly Finding[]): readonly FindingGroup[] => {
	const order: CheckId[] = []
	const byCheck = new Map<CheckId, Finding[]>()
	for (const finding of findings) {
		const existing = byCheck.get(finding.checkId)
		if (existing) existing.push(finding)
		else {
			order.push(finding.checkId)
			byCheck.set(finding.checkId, [finding])
		}
	}
	return order.map((checkId) => ({ checkId, title: checkById(checkId)?.title ?? checkId, findings: byCheck.get(checkId) ?? [] }))
}

/** Checks that did not run this pass — today always the GitHub-dependent ones. */
export const skippedChecks = (report: ProjectsReport): readonly CheckId[] => projectChecks.filter((check) => !report.ranCheckIds.includes(check.id)).map((check) => check.id)

export const scannedRepositoryCount = (report: ProjectsReport): number => report.projects.filter((project) => project.repo.isGitRepo).length

const severityOf = (findings: readonly Finding[]): FindingSeverity => findings[0]?.severity ?? "info"

export const findingText = (finding: Finding, groupTitle: string): string => (finding.title === groupTitle ? finding.detail : `${finding.title} — ${finding.detail}`)

export interface InventoryCells {
	readonly name: string
	readonly branch: string
	/** Working-tree shape: dirty count, ahead/behind, stashes — or "clean". */
	readonly state: string
	readonly age: string
	readonly lifecycle: string
	readonly remote: string
}

export const inventoryCells = (project: ProjectSnapshot): InventoryCells => {
	const repo = project.repo
	if (!repo.isGitRepo) {
		return { name: repo.name, branch: "—", state: repo.scanError ? "unreadable" : "not a repo", age: "", lifecycle: project.intent?.lifecycle ?? "", remote: "" }
	}
	const parts: string[] = []
	if (repo.dirtyCount > 0) parts.push(`●${repo.dirtyCount}`)
	if (repo.ahead > 0) parts.push(`↑${repo.ahead}`)
	if (repo.behind > 0) parts.push(`↓${repo.behind}`)
	if (repo.stashCount > 0) parts.push(`⌥${repo.stashCount}`)
	return {
		name: repo.name,
		branch: repo.detachedHead ? "detached" : (repo.currentBranch ?? "—"),
		state: repo.scanError ? "unreadable" : parts.length > 0 ? parts.join(" ") : "clean",
		age: repo.lastCommitRelative ?? (repo.lastCommitAt ? "" : "no commits"),
		lifecycle: project.intent?.lifecycle ?? "",
		remote: repo.remote ?? repo.remoteUrl ?? "",
	}
}

const warningRows = (report: ProjectsReport, rows: ProjectsRow[]): void => {
	if (report.warnings.length === 0) return
	report.warnings.forEach((text, index) => rows.push({ kind: "note", key: `warning-${index}`, text, tone: "warning" }))
	rows.push({ kind: "blank", key: "warning-gap" })
}

const skippedRow = (report: ProjectsReport, rows: ProjectsRow[]): void => {
	const skipped = skippedChecks(report)
	if (skipped.length === 0) return
	const titles = skipped.map((checkId) => checkById(checkId)?.title ?? checkId).join(", ")
	rows.push({ kind: "note", key: "skipped", text: `Skipped without GitHub data: ${titles.toLowerCase()}.`, tone: "muted" })
	rows.push({ kind: "blank", key: "skipped-gap" })
}

const withSelectable = (rows: readonly ProjectsRow[]): ProjectsRows => ({
	rows,
	selectable: rows.reduce<number[]>((acc, row, index) => {
		if (row.kind === "finding" || row.kind === "project") acc.push(index)
		return acc
	}, []),
})

/** Findings grouped by check — the default body. */
export const findingRows = (report: ProjectsReport): ProjectsRows => {
	const rows: ProjectsRow[] = []
	warningRows(report, rows)
	skippedRow(report, rows)
	const groups = groupFindings(report.findings)
	groups.forEach((group, index) => {
		if (index > 0) rows.push({ kind: "blank", key: `gap-${group.checkId}` })
		rows.push({ kind: "heading", key: `heading-${group.checkId}`, text: group.title, count: group.findings.length, severity: severityOf(group.findings) })
		// A check whose findings all share its title (the common case) would just
		// repeat the heading on every row, so only variant titles are shown.
		for (const finding of group.findings) rows.push({ kind: "finding", key: finding.id, finding, text: findingText(finding, group.title) })
	})
	return withSelectable(rows)
}

/** Every project we scanned, whether or not it has a finding. Toggled with `a`. */
export const inventoryRows = (report: ProjectsReport): ProjectsRows => {
	const rows: ProjectsRow[] = []
	warningRows(report, rows)
	const counts = new Map<string, number>()
	for (const finding of report.findings) counts.set(finding.projectPath, (counts.get(finding.projectPath) ?? 0) + 1)
	const projects = [...report.projects].sort((a, b) => a.repo.name.localeCompare(b.repo.name) || a.repo.path.localeCompare(b.repo.path))
	rows.push({ kind: "heading", key: "heading-inventory", text: "All projects", count: projects.length, severity: "info" })
	for (const project of projects) rows.push({ kind: "project", key: project.repo.path, project, findingCount: counts.get(project.repo.path) ?? 0 })
	return withSelectable(rows)
}

export const projectsRows = (report: ProjectsReport, inventory: boolean): ProjectsRows => (inventory ? inventoryRows(report) : findingRows(report))

/** What `enter` acts on: a finding's URL if it has one, otherwise its directory. */
export const rowOpenTarget = (row: ProjectsRow | null): string | null => {
	if (!row) return null
	if (row.kind === "finding") return row.finding.url ?? row.finding.projectPath
	if (row.kind === "project") return row.project.repo.path
	return null
}

export const clampSelection = (index: number, count: number): number => (count <= 0 ? 0 : Math.max(0, Math.min(index, count - 1)))
