// === Projects config ===
//
// PRIVACY CONTRACT: this file must never contain a real scan root, project name
// or intent note. Every path and every word of intent is USER data, resolved at
// runtime from (in precedence order) GHUI_* env vars and
// $XDG_CONFIG_HOME/ghui/projects.toml. With nothing configured the answer is an
// empty root list and the surface renders a hint — never a guessed directory.
//
// Conventions borrowed from the codebase, deliberately:
//   - scalar knobs via Effect `Config` + GHUI_* env, materialized once at module
//     load (src/config.ts)
//   - the XDG config-directory ladder (src/themeStore.ts)
//   - file reads that degrade to a default instead of failing
//     (src/workspacePreferenceFile.ts)
//
// TOML is parsed with `Bun.TOML.parse` (built into Bun 1.3.14, typed as
// `object`), so no dependency is added and no hand-rolled parser is needed.
// Its output is normalized field-by-field below rather than Schema-decoded:
// a malformed user file must degrade to defaults + a warning string, and
// per-field normalization is what lets us tell the user WHICH key was wrong.

import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { Cause, Config, Effect } from "effect"
import { errorMessage } from "../errors.js"
import { isProjectLifecycle, type CheckContext, type ProjectIntent, type ProjectLifecycle } from "./types.js"

const DEFAULT_STALE_DAYS = 14
const DEFAULT_MAX_DEPTH = 1
const MAX_MAX_DEPTH = 6

const positiveIntOr = (fallback: number) => (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback)

const depthOr = (fallback: number) => (value: number) => Math.min(MAX_MAX_DEPTH, positiveIntOr(fallback)(value))

// === Paths ===

const configDirectory = () => {
	if (process.env.GHUI_CONFIG_DIR) return process.env.GHUI_CONFIG_DIR
	if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "ghui")
	if (process.platform === "win32" && process.env.APPDATA) return join(process.env.APPDATA, "ghui")
	return join(homedir(), ".config", "ghui")
}

const pathOverride = () => process.env.GHUI_PROJECTS_CONFIG_PATH?.trim() ?? process.env.GHUI_PROJECTS_CONFIG?.trim()

/**
 * Absolute path to the user's projects.toml, or null when the file is disabled.
 * Override with GHUI_PROJECTS_CONFIG_PATH (alias: GHUI_PROJECTS_CONFIG);
 * "off" / "0" / "false" disables file loading entirely, which is what tests use.
 */
export const projectsConfigPath = (): string | null => {
	const value = pathOverride()
	if (value === "off" || value === "0" || value === "false") return null
	return value !== undefined && value.length > 0 ? expandHome(value) : join(configDirectory(), "projects.toml")
}

/** Expand a leading `~` (and `$HOME`) against the current user's home directory. */
export const expandHome = (path: string): string => {
	if (path === "~") return homedir()
	if (path.startsWith("~/")) return join(homedir(), path.slice(2))
	if (path === "$HOME") return homedir()
	if (path.startsWith("$HOME/")) return join(homedir(), path.slice(6))
	return path
}

const normalizeRoot = (value: string): string | null => {
	const trimmed = value.trim()
	if (trimmed.length === 0) return null
	const expanded = expandHome(trimmed)
	// Relative roots are resolved against the process cwd, matching how every
	// other path-ish option in this app behaves.
	return isAbsolute(expanded) ? expanded : resolve(expanded)
}

const dedupe = (values: readonly string[]): readonly string[] => [...new Set(values)]

// === Env-driven scalars (src/config.ts idiom) ===

const projectsEnvConfig = Config.all({
	staleDays: Config.int("GHUI_PROJECTS_STALE_DAYS").pipe(Config.withDefault(DEFAULT_STALE_DAYS), Config.map(positiveIntOr(DEFAULT_STALE_DAYS))),
	maxDepth: Config.int("GHUI_PROJECTS_MAX_DEPTH").pipe(Config.withDefault(DEFAULT_MAX_DEPTH), Config.map(depthOr(DEFAULT_MAX_DEPTH))),
})

export interface ProjectsEnvConfig {
	readonly staleDays: number
	readonly maxDepth: number
}

const envFallback: ProjectsEnvConfig = { staleDays: DEFAULT_STALE_DAYS, maxDepth: DEFAULT_MAX_DEPTH }

/**
 * Materialized at module load like `config` in src/config.ts, but guarded: a
 * non-numeric GHUI_PROJECTS_* value falls back to defaults instead of throwing
 * during import and taking the whole TUI down at startup.
 */
export const projectsEnv: ProjectsEnvConfig = Effect.runSync(
	Effect.gen(function* () {
		return yield* projectsEnvConfig
	}).pipe(Effect.catchCause(() => Effect.succeed(envFallback))),
)

/** GHUI_PROJECTS_ROOTS (alias: GHUI_PROJECT_ROOTS) — colon or comma separated; wins over the config file. */
const envRoots = (): readonly string[] => {
	const raw = process.env.GHUI_PROJECTS_ROOTS ?? process.env.GHUI_PROJECT_ROOTS ?? ""
	return dedupe(
		raw
			.split(/[:,]/)
			.map(normalizeRoot)
			.filter((root): root is string => root !== null),
	)
}

// === Shape ===

export interface ProjectsConfig {
	/** Absolute directories to scan. EMPTY when nothing is configured — never a guessed default. */
	readonly roots: readonly string[]
	/** Directory names or glob-ish patterns to skip (matched by the scanner, not here). */
	readonly exclude: readonly string[]
	/** Days without a commit before a repo counts as stale. */
	readonly staleDays: number
	/** How deep below each root to look for projects. 1 = the root's immediate children. */
	readonly maxDepth: number
	/** `[intent.<project-name>]` entries, keyed by the project directory name. */
	readonly intent: Readonly<Record<string, ProjectIntent>>
	/** Where the config was read from (or would be). Null when file loading is disabled. */
	readonly configPath: string | null
	/** True when a projects.toml actually existed and parsed. */
	readonly configFileExists: boolean
	/** Non-fatal problems to surface in the UI. Never throw; warn instead. */
	readonly warnings: readonly string[]
}

export const emptyProjectsConfig: ProjectsConfig = {
	roots: [],
	exclude: [],
	staleDays: DEFAULT_STALE_DAYS,
	maxDepth: DEFAULT_MAX_DEPTH,
	intent: {},
	configPath: null,
	configFileExists: false,
	warnings: [],
}

/** True when the surface should render the "create a projects.toml" hint instead of a report. */
export const hasConfiguredRoots = (config: ProjectsConfig): boolean => config.roots.length > 0

/** Build the pure context that checks run against. */
export const checkContext = (config: ProjectsConfig, now: Date = new Date()): CheckContext => ({
	now,
	staleDays: config.staleDays,
	configPath: config.configPath,
})

/**
 * Intent for a project. Looks up the directory name first (the documented key),
 * then falls back to the absolute path so a user who keys by path still works.
 */
export const resolveProjectIntent = (config: ProjectsConfig, project: { readonly name: string; readonly path: string }): ProjectIntent | null =>
	config.intent[project.name] ?? config.intent[project.path] ?? null

// === Normalization ===

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const stringList = (value: unknown, key: string, warnings: string[]): readonly string[] => {
	if (value === undefined) return []
	if (!Array.isArray(value)) {
		warnings.push(`projects.toml: "${key}" must be an array of strings; ignoring it.`)
		return []
	}
	const strings = value.filter((entry): entry is string => typeof entry === "string")
	if (strings.length !== value.length) warnings.push(`projects.toml: "${key}" contains non-string entries; they were ignored.`)
	return strings
}

const positiveNumber = (value: unknown, key: string, fallback: number, warnings: string[]): number => {
	if (value === undefined) return fallback
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		warnings.push(`projects.toml: "${key}" must be a positive number; using ${fallback}.`)
		return fallback
	}
	return Math.floor(value)
}

const lifecycleOr = (value: unknown, key: string, warnings: string[]): ProjectLifecycle => {
	if (value === undefined) return "alive"
	if (!isProjectLifecycle(value)) {
		warnings.push(`projects.toml: "${key}" has an unknown lifecycle; using "alive".`)
		return "alive"
	}
	return value
}

const normalizeIntentEntry = (name: string, value: unknown, warnings: string[]): ProjectIntent | null => {
	// `name = "parked"` is accepted as shorthand for a lifecycle; any other bare
	// string is treated as a note on an otherwise-alive project.
	if (typeof value === "string") {
		const trimmed = value.trim()
		if (trimmed.length === 0) return null
		return isProjectLifecycle(trimmed) ? { lifecycle: trimmed } : { lifecycle: "alive", note: trimmed }
	}
	if (!isRecord(value)) {
		warnings.push(`projects.toml: "[intent.${name}]" must be a table or a string; ignoring it.`)
		return null
	}
	const lifecycle = lifecycleOr(value.lifecycle, `intent.${name}.lifecycle`, warnings)
	const note = typeof value.note === "string" && value.note.trim().length > 0 ? value.note.trim() : null
	return note === null ? { lifecycle } : { lifecycle, note }
}

const normalizeIntent = (value: unknown, warnings: string[]): Readonly<Record<string, ProjectIntent>> => {
	if (value === undefined) return {}
	if (!isRecord(value)) {
		warnings.push(`projects.toml: "[intent]" must be a table; ignoring it.`)
		return {}
	}
	const entries: [string, ProjectIntent][] = []
	for (const [name, entry] of Object.entries(value)) {
		const intent = normalizeIntentEntry(name, entry, warnings)
		if (intent !== null) entries.push([name, intent])
	}
	return Object.fromEntries(entries)
}

export interface NormalizeProjectsConfigOptions {
	readonly configPath: string | null
	readonly configFileExists: boolean
	/** Roots from GHUI_PROJECTS_ROOTS; when non-empty they replace the file's roots entirely. */
	readonly overrideRoots?: readonly string[]
	/** Warnings accumulated before normalization (e.g. an unreadable file). */
	readonly warnings?: readonly string[]
}

/**
 * Pure: `Bun.TOML.parse` output (or anything else) in, a valid ProjectsConfig
 * out. Never throws. Exported so tests can exercise the schema without touching
 * the filesystem.
 */
export const normalizeProjectsConfig = (raw: unknown, options: NormalizeProjectsConfigOptions): ProjectsConfig => {
	const warnings: string[] = [...(options.warnings ?? [])]
	const table = isRecord(raw) ? raw : {}
	if (!isRecord(raw) && raw !== undefined && raw !== null) warnings.push("projects.toml: expected a table at the top level; using defaults.")

	const fileRoots = dedupe(
		stringList(table.roots, "roots", warnings)
			.map(normalizeRoot)
			.filter((root): root is string => root !== null),
	)
	const overrideRoots = options.overrideRoots ?? []
	const roots = overrideRoots.length > 0 ? overrideRoots : fileRoots

	const exclude = dedupe(
		stringList(table.exclude, "exclude", warnings)
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0),
	)

	return {
		roots,
		exclude,
		staleDays: positiveNumber(table.staleDays, "staleDays", projectsEnv.staleDays, warnings),
		maxDepth: Math.min(MAX_MAX_DEPTH, positiveNumber(table.maxDepth, "maxDepth", projectsEnv.maxDepth, warnings)),
		intent: normalizeIntent(table.intent, warnings),
		configPath: options.configPath,
		configFileExists: options.configFileExists,
		warnings,
	}
}

// === Loading ===

interface RawConfigFile {
	readonly table: unknown
	readonly exists: boolean
	readonly warnings: readonly string[]
}

const readConfigFile = (path: string | null): Effect.Effect<RawConfigFile> => {
	if (path === null) return Effect.succeed({ table: undefined, exists: false, warnings: [] })
	return Effect.tryPromise(async (): Promise<RawConfigFile> => {
		const file = Bun.file(path)
		if (!(await file.exists())) return { table: undefined, exists: false, warnings: [] }
		const text = await file.text()
		try {
			return { table: Bun.TOML.parse(text), exists: true, warnings: [] }
		} catch (cause) {
			// Malformed TOML is a user typo, not a crash: keep the parser's own
			// message (it points at the offending line) and fall back to defaults.
			return { table: undefined, exists: true, warnings: [`${path} is not valid TOML: ${errorMessage(cause)}. Using defaults.`] }
		}
	}).pipe(
		Effect.catchCause((cause) =>
			Effect.succeed<RawConfigFile>({
				table: undefined,
				exists: true,
				warnings: [`Could not read ${path}: ${errorMessage(Cause.squash(cause))}. Using defaults.`],
			}),
		),
	)
}

/**
 * Resolve the user's projects config. NEVER fails and never throws: a missing
 * file yields defaults, a malformed file yields defaults plus a warning string
 * that the surface renders.
 *
 * Precedence: GHUI_PROJECTS_ROOTS > projects.toml `roots` > [] (empty).
 */
export const loadProjectsConfig: Effect.Effect<ProjectsConfig> = Effect.gen(function* () {
	const configPath = projectsConfigPath()
	const file = yield* readConfigFile(configPath)
	return normalizeProjectsConfig(file.table, {
		configPath,
		configFileExists: file.exists,
		overrideRoots: envRoots(),
		warnings: file.warnings,
	})
})

/** Alias — some call sites were specced against this name. Same Effect. */
export const readProjectsConfig: Effect.Effect<ProjectsConfig> = loadProjectsConfig
