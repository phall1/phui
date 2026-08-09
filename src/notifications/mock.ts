// Fixture feed for `bun run dev:mock`, which runs with no `gh` at all. Covers
// one row of every bucket so layout work never needs a real inbox in a
// particular state.

import type { NotificationItem, NotificationsReport } from "./types.js"

interface MockSpec {
	readonly id: string
	readonly repository: string
	readonly reason: NotificationItem["reason"]
	readonly subjectType: NotificationItem["subjectType"]
	readonly title: string
	readonly number: number | null
	readonly unread: boolean
	readonly minutesAgo: number
}

const SPECS: readonly MockSpec[] = [
	{
		id: "1",
		repository: "kitlangton/ghui",
		reason: "review_requested",
		subjectType: "PullRequest",
		title: "Stack diff rendering behind a viewport window",
		number: 412,
		unread: true,
		minutesAgo: 18,
	},
	{
		id: "2",
		repository: "Effect-TS/effect",
		reason: "mention",
		subjectType: "Issue",
		title: "Schema.Struct loses optionalKey through a union",
		number: 5310,
		unread: true,
		minutesAgo: 52,
	},
	{
		id: "3",
		repository: "phall1/phui",
		reason: "assign",
		subjectType: "Issue",
		title: "Notification inbox: mark-all-read needs a confirm",
		number: 88,
		unread: true,
		minutesAgo: 96,
	},
	{
		id: "4",
		repository: "phall1/phui",
		reason: "author",
		subjectType: "PullRequest",
		title: "feat(inbox): triage GitHub notifications without leaving the terminal",
		number: 91,
		unread: true,
		minutesAgo: 140,
	},
	{ id: "5", repository: "phall1/phui", reason: "ci_activity", subjectType: "CheckSuite", title: "publish workflow failed on main", number: null, unread: true, minutesAgo: 200 },
	{
		id: "6",
		repository: "phall1/phux",
		reason: "security_alert",
		subjectType: "RepositoryVulnerabilityAlert",
		title: "Dependabot alert: tar-fs path traversal",
		number: null,
		unread: true,
		minutesAgo: 600,
	},
	{ id: "7", repository: "oven-sh/bun", reason: "subscribed", subjectType: "Release", title: "Bun v1.3.15", number: null, unread: false, minutesAgo: 900 },
	{ id: "8", repository: "sst/opentui", reason: "comment", subjectType: "Issue", title: "Native image rendering on kitty vs iTerm2", number: 244, unread: false, minutesAgo: 1500 },
	{
		id: "9",
		repository: "kitlangton/ghui",
		reason: "state_change",
		subjectType: "PullRequest",
		title: "fix(comments): preserve refresh errors",
		number: 402,
		unread: false,
		minutesAgo: 2600,
	},
]

const toItem = (spec: MockSpec, now: Date): NotificationItem => ({
	id: spec.id,
	repository: spec.repository,
	unread: spec.unread,
	reason: spec.reason,
	subjectType: spec.subjectType,
	title: spec.title,
	number: spec.number,
	url:
		spec.number === null
			? `https://github.com/${spec.repository}`
			: `https://github.com/${spec.repository}/${spec.subjectType === "PullRequest" ? "pull" : "issues"}/${spec.number}`,
	updatedAt: new Date(now.getTime() - spec.minutesAgo * 60_000),
})

export const mockNotificationsReport = (now: Date): NotificationsReport => ({
	items: SPECS.map((spec) => toItem(spec, now)),
	fetchedAt: now,
	warnings: [],
})
