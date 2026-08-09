// === Inbox: the GitHub seam ===
//
// The notification feed is a REST-only endpoint (there is no GraphQL
// equivalent), so this talks to `gh api` through `CommandRunner` rather than
// going through `GitHubService`'s GraphQL helpers.
//
// TWO RULES:
//
//  1. LISTING NEVER FAILS. `listNotifications` has `E = never`. No auth, a
//     rate limit, a `gh` that is not installed — each yields an empty report
//     plus a warning string the surface renders. An inbox that throws is an
//     inbox you stop opening.
//
//  2. MUTATIONS DO FAIL, LOUDLY. Marking a thread read or done changes state on
//     github.com; silently swallowing a failure would leave the list showing a
//     lie. Those return `CommandError` and the view turns it into a notice.

import { Cause, Effect, Schema } from "effect"
import { errorMessage } from "../errors.js"
import { CommandRunner, type CommandError } from "../services/CommandRunner.js"
import {
	emptyNotificationsReport,
	isNotificationReason,
	isNotificationSubjectType,
	type NotificationItem,
	type NotificationsReport,
	type NotificationSubjectType,
} from "./types.js"

const RawSubjectSchema = Schema.Struct({
	title: Schema.String,
	url: Schema.optionalKey(Schema.NullOr(Schema.String)),
	type: Schema.String,
})

const RawNotificationSchema = Schema.Struct({
	id: Schema.String,
	unread: Schema.Boolean,
	reason: Schema.String,
	updated_at: Schema.String,
	subject: RawSubjectSchema,
	repository: Schema.Struct({ full_name: Schema.String }),
})

const RawNotificationListSchema = Schema.Array(RawNotificationSchema)

export interface ListNotificationsOptions {
	/** `false` (the default) returns unread only — GitHub's own inbox default. */
	readonly includeRead: boolean
	/** Restrict to threads you are directly involved in. */
	readonly participatingOnly: boolean
	readonly limit: number
}

export const defaultListOptions: ListNotificationsOptions = { includeRead: false, participatingOnly: false, limit: 50 }

const listArgs = (options: ListNotificationsOptions): readonly string[] => [
	"api",
	"-H",
	"Accept: application/vnd.github+json",
	`notifications?all=${options.includeRead}&participating=${options.participatingOnly}&per_page=${Math.max(1, Math.min(100, options.limit))}`,
]

const subjectType = (value: string): NotificationSubjectType => (isNotificationSubjectType(value) ? value : "Other")

const lastSegment = (url: string): string => {
	const parts = url.split("?")[0]!.split("/")
	return parts[parts.length - 1] ?? ""
}

/** The trailing path segment of an API subject URL, when it is a number. */
export const subjectNumber = (apiUrl: string | null): number | null => {
	if (apiUrl === null) return null
	const segment = lastSegment(apiUrl)
	if (!/^\d+$/.test(segment)) return null
	const parsed = Number.parseInt(segment, 10)
	return Number.isSafeInteger(parsed) ? parsed : null
}

/**
 * Browser URL for a notification subject.
 *
 * GitHub hands back `api.github.com` URLs (and `null` for discussions and
 * check suites), so this maps the handful of shapes that matter and degrades to
 * the most specific repository page it can otherwise justify — never to a
 * fabricated deep link.
 */
export const subjectHtmlUrl = (repository: string, type: NotificationSubjectType, apiUrl: string | null): string | null => {
	const repoUrl = `https://github.com/${repository}`
	if (apiUrl !== null) {
		const number = subjectNumber(apiUrl)
		if (number !== null && type === "PullRequest") return `${repoUrl}/pull/${number}`
		if (number !== null && type === "Issue") return `${repoUrl}/issues/${number}`
		if (type === "Commit") return `${repoUrl}/commit/${lastSegment(apiUrl)}`
	}
	if (type === "Release") return `${repoUrl}/releases`
	if (type === "CheckSuite") return `${repoUrl}/actions`
	if (type === "Discussion") return `${repoUrl}/discussions`
	if (type === "RepositoryVulnerabilityAlert") return `${repoUrl}/security/dependabot`
	return apiUrl === null ? repoUrl : null
}

export const parseNotification = (raw: typeof RawNotificationSchema.Type): NotificationItem => {
	const type = subjectType(raw.subject.type)
	const apiUrl = raw.subject.url ?? null
	return {
		id: raw.id,
		repository: raw.repository.full_name,
		unread: raw.unread,
		reason: isNotificationReason(raw.reason) ? raw.reason : "other",
		subjectType: type,
		title: raw.subject.title,
		number: type === "PullRequest" || type === "Issue" ? subjectNumber(apiUrl) : null,
		url: subjectHtmlUrl(raw.repository.full_name, type, apiUrl),
		updatedAt: new Date(raw.updated_at),
	}
}

/**
 * Newest first. GitHub already returns the feed in this order, but the list is
 * re-sorted locally so an optimistic mutation (mark read, mark done) cannot
 * leave rows out of order between a mutation and the next fetch.
 */
const byRecency = (items: readonly NotificationItem[]): readonly NotificationItem[] => [...items].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

export const listNotifications = (options: ListNotificationsOptions, now: Date): Effect.Effect<NotificationsReport, never, CommandRunner> =>
	Effect.gen(function* () {
		const command = yield* CommandRunner
		const outcome = yield* command.runSchema(RawNotificationListSchema, "gh", listArgs(options)).pipe(
			Effect.map((rows) => ({ _tag: "ok" as const, rows })),
			Effect.catchCause((cause) => Effect.succeed({ _tag: "failed" as const, message: notificationsWarning(Cause.squash(cause)) })),
		)
		if (outcome._tag === "failed") return emptyNotificationsReport(now, [outcome.message])
		return { items: byRecency(outcome.rows.map(parseNotification)), fetchedAt: now, warnings: [] }
	}).pipe(Effect.withSpan("Notifications.list"))

export const notificationsWarning = (cause: unknown): string => {
	const message = errorMessage(cause)
	if (/401|bad credentials|requires authentication/i.test(message)) return "GitHub rejected the request — run `gh auth login` (the token needs the `notifications` scope)."
	if (/rate limit/i.test(message)) return "GitHub rate limit reached; the inbox refills on the next refresh."
	if (/enoent|not found: gh|command not found/i.test(message)) return "The `gh` CLI is not on PATH; phui reads notifications through it."
	return `Could not load notifications: ${message}`
}

// === Mutations ===

const threadArgs = (id: string, method: string, suffix = ""): readonly string[] => ["api", "-X", method, `notifications/threads/${id}${suffix}`]

export const markThreadRead = (id: string): Effect.Effect<void, CommandError, CommandRunner> =>
	Effect.gen(function* () {
		const command = yield* CommandRunner
		yield* command.run("gh", threadArgs(id, "PATCH"))
	}).pipe(Effect.asVoid, Effect.withSpan("Notifications.markThreadRead"))

/**
 * "Done" in GitHub's UI. The thread leaves the inbox until something new
 * happens on it — which is the action that actually empties a queue, so it gets
 * the primary key.
 */
export const markThreadDone = (id: string): Effect.Effect<void, CommandError, CommandRunner> =>
	Effect.gen(function* () {
		const command = yield* CommandRunner
		yield* command.run("gh", threadArgs(id, "DELETE"))
	}).pipe(Effect.asVoid, Effect.withSpan("Notifications.markThreadDone"))

export const unsubscribeThread = (id: string): Effect.Effect<void, CommandError, CommandRunner> =>
	Effect.gen(function* () {
		const command = yield* CommandRunner
		yield* command.run("gh", threadArgs(id, "DELETE", "/subscription"))
	}).pipe(Effect.asVoid, Effect.withSpan("Notifications.unsubscribeThread"))

export const markAllRead = (before: Date): Effect.Effect<void, CommandError, CommandRunner> =>
	Effect.gen(function* () {
		const command = yield* CommandRunner
		yield* command.run("gh", ["api", "-X", "PUT", "notifications", "-f", `last_read_at=${before.toISOString()}`, "-F", "read=true"])
	}).pipe(Effect.asVoid, Effect.withSpan("Notifications.markAllRead"))
