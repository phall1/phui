// === Inbox: domain ===
//
// GitHub's notification feed, normalised into something a triage list can
// render. The important transformation is `reasonBucket`: GitHub gives you
// fifteen flat `reason` strings, but the only question you ask an inbox is
// "does this need me, or am I just watching it?" — so the surface groups by
// that answer rather than by repository or by time.

export const notificationSubjectTypes = ["PullRequest", "Issue", "Release", "Discussion", "CheckSuite", "Commit", "RepositoryVulnerabilityAlert", "Other"] as const
export type NotificationSubjectType = (typeof notificationSubjectTypes)[number]

export const notificationReasons = [
	"approval_requested",
	"assign",
	"author",
	"ci_activity",
	"comment",
	"invitation",
	"manual",
	"member_feature_requested",
	"mention",
	"review_requested",
	"security_advisory_credit",
	"security_alert",
	"state_change",
	"subscribed",
	"team_mention",
	"other",
] as const
export type NotificationReason = (typeof notificationReasons)[number]

export interface NotificationItem {
	readonly id: string
	readonly repository: string
	readonly unread: boolean
	readonly reason: NotificationReason
	readonly subjectType: NotificationSubjectType
	readonly title: string
	/** Issue/PR number, when the subject has one. `null` for releases, commits, vulnerability alerts. */
	readonly number: number | null
	/** Browser URL. `null` when GitHub gives no addressable subject (some discussions). */
	readonly url: string | null
	readonly updatedAt: Date
}

// === Buckets ===

export const notificationBuckets = ["needsYou", "yours", "ci", "security", "watching"] as const
export type NotificationBucket = (typeof notificationBuckets)[number]

export const notificationBucketLabels: Record<NotificationBucket, string> = {
	needsYou: "NEEDS YOU",
	yours: "YOUR THREADS",
	ci: "CI",
	security: "SECURITY",
	watching: "WATCHING",
}

const REASON_BUCKET: Record<NotificationReason, NotificationBucket> = {
	approval_requested: "needsYou",
	assign: "needsYou",
	invitation: "needsYou",
	mention: "needsYou",
	review_requested: "needsYou",
	team_mention: "needsYou",
	author: "yours",
	ci_activity: "ci",
	security_advisory_credit: "security",
	security_alert: "security",
	comment: "watching",
	manual: "watching",
	member_feature_requested: "watching",
	state_change: "watching",
	subscribed: "watching",
	other: "watching",
}

export const reasonBucket = (reason: NotificationReason): NotificationBucket => REASON_BUCKET[reason]

/** Short right-aligned tag on each row. Kept under 10 columns so it survives narrow panes. */
export const notificationReasonLabels: Record<NotificationReason, string> = {
	approval_requested: "approval",
	assign: "assigned",
	author: "yours",
	ci_activity: "ci",
	comment: "comment",
	invitation: "invited",
	manual: "watching",
	member_feature_requested: "request",
	mention: "mention",
	review_requested: "review",
	security_advisory_credit: "credit",
	security_alert: "security",
	state_change: "state",
	subscribed: "subscribed",
	team_mention: "team",
	other: "other",
}

export const notificationSubjectGlyphs: Record<NotificationSubjectType, string> = {
	PullRequest: "⇄",
	Issue: "○",
	Release: "⬢",
	Discussion: "▣",
	CheckSuite: "◈",
	Commit: "◇",
	RepositoryVulnerabilityAlert: "⚠",
	Other: "·",
}

export const isNotificationReason = (value: string): value is NotificationReason => (notificationReasons as readonly string[]).includes(value)

export const isNotificationSubjectType = (value: string): value is NotificationSubjectType => (notificationSubjectTypes as readonly string[]).includes(value)

export interface NotificationsReport {
	readonly items: readonly NotificationItem[]
	readonly fetchedAt: Date
	/** Non-fatal problems (auth, rate limit) surfaced instead of thrown; see ./github.ts. */
	readonly warnings: readonly string[]
}

export const emptyNotificationsReport = (fetchedAt: Date, warnings: readonly string[] = []): NotificationsReport => ({ items: [], fetchedAt, warnings })

export const unreadCount = (items: readonly NotificationItem[]) => items.reduce((count, item) => count + (item.unread ? 1 : 0), 0)

/**
 * Does this notification point at something phui can open itself? Everything
 * else falls back to the browser, which is the one thing this surface exists to
 * make unnecessary — so the set is deliberately as wide as the app can honour.
 */
export const isOpenableInApp = (item: NotificationItem): boolean =>
	(item.subjectType === "PullRequest" || item.subjectType === "Issue") && item.number !== null && item.repository.includes("/")
