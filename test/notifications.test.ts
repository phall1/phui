import { describe, expect, test } from "bun:test"
import { parseNotification, subjectHtmlUrl, subjectNumber } from "../src/notifications/github.ts"
import { clampSelection, notificationsRows, selectedNotification, visibleNotifications } from "../src/notifications/rows.ts"
import { isOpenableInApp, reasonBucket, unreadCount, type NotificationItem } from "../src/notifications/types.ts"

const item = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
	id: "1",
	repository: "owner/repo",
	unread: true,
	reason: "subscribed",
	subjectType: "PullRequest",
	title: "A change",
	number: 1,
	url: "https://github.com/owner/repo/pull/1",
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	...overrides,
})

const report = (items: readonly NotificationItem[], warnings: readonly string[] = []) => ({
	items,
	fetchedAt: new Date("2026-01-02T00:00:00Z"),
	warnings,
})

const noOverlays = { unreadOnly: false, dismissed: new Set<string>(), read: new Set<string>() }

describe("subject URLs", () => {
	test("maps API pull and issue URLs to browser URLs", () => {
		expect(subjectHtmlUrl("owner/repo", "PullRequest", "https://api.github.com/repos/owner/repo/pulls/42")).toBe("https://github.com/owner/repo/pull/42")
		expect(subjectHtmlUrl("owner/repo", "Issue", "https://api.github.com/repos/owner/repo/issues/7")).toBe("https://github.com/owner/repo/issues/7")
	})

	test("falls back to the most specific repository page for subjects with no deep link", () => {
		expect(subjectHtmlUrl("owner/repo", "CheckSuite", null)).toBe("https://github.com/owner/repo/actions")
		expect(subjectHtmlUrl("owner/repo", "Release", null)).toBe("https://github.com/owner/repo/releases")
		expect(subjectHtmlUrl("owner/repo", "Discussion", null)).toBe("https://github.com/owner/repo/discussions")
	})

	test("never invents a deep link for an unknown subject", () => {
		expect(subjectHtmlUrl("owner/repo", "Other", null)).toBe("https://github.com/owner/repo")
		expect(subjectHtmlUrl("owner/repo", "Other", "https://api.github.com/repos/owner/repo/something/9")).toBeNull()
	})

	test("reads the trailing number only when there is one", () => {
		expect(subjectNumber("https://api.github.com/repos/owner/repo/pulls/42")).toBe(42)
		expect(subjectNumber("https://api.github.com/repos/owner/repo/commits/abc123")).toBeNull()
		expect(subjectNumber(null)).toBeNull()
	})
})

describe("parseNotification", () => {
	test("normalises a pull request thread", () => {
		const parsed = parseNotification({
			id: "9",
			unread: true,
			reason: "review_requested",
			updated_at: "2026-01-01T10:00:00Z",
			subject: { title: "Add pagination", url: "https://api.github.com/repos/owner/repo/pulls/12", type: "PullRequest" },
			repository: { full_name: "owner/repo" },
		})

		expect(parsed).toMatchObject({ id: "9", repository: "owner/repo", reason: "review_requested", subjectType: "PullRequest", number: 12 })
		expect(parsed.url).toBe("https://github.com/owner/repo/pull/12")
	})

	test("degrades an unrecognised reason and subject rather than dropping the row", () => {
		const parsed = parseNotification({
			id: "10",
			unread: false,
			reason: "something_new_github_added",
			updated_at: "2026-01-01T10:00:00Z",
			subject: { title: "Who knows", type: "SomethingNew" },
			repository: { full_name: "owner/repo" },
		})

		expect(parsed.reason).toBe("other")
		expect(parsed.subjectType).toBe("Other")
		expect(parsed.number).toBeNull()
	})
})

describe("buckets", () => {
	test("routes the reasons that want something from you into needsYou", () => {
		for (const reason of ["review_requested", "approval_requested", "assign", "mention", "team_mention", "invitation"] as const) {
			expect(reasonBucket(reason)).toBe("needsYou")
		}
	})

	test("keeps CI, security, and passive watching apart", () => {
		expect(reasonBucket("ci_activity")).toBe("ci")
		expect(reasonBucket("security_alert")).toBe("security")
		expect(reasonBucket("author")).toBe("yours")
		expect(reasonBucket("subscribed")).toBe("watching")
	})
})

describe("notificationsRows", () => {
	test("orders buckets by urgency regardless of arrival order", () => {
		const model = notificationsRows(
			report([item({ id: "a", reason: "subscribed" }), item({ id: "b", reason: "ci_activity" }), item({ id: "c", reason: "review_requested" })]),
			noOverlays,
		)

		const headings = model.rows.flatMap((row) => (row.kind === "heading" ? [row.bucket] : []))
		expect(headings).toEqual(["needsYou", "ci", "watching"])
	})

	test("selectable indices point only at item rows", () => {
		const model = notificationsRows(report([item({ id: "a", reason: "review_requested" }), item({ id: "b", reason: "subscribed" })]), noOverlays)

		expect(model.selectable.length).toBe(2)
		for (const index of model.selectable) expect(model.rows[index]?.kind).toBe("item")
		expect(selectedNotification(model, 1)?.id).toBe("b")
	})

	test("renders warnings above everything else", () => {
		const model = notificationsRows(report([item()], ["gh is unhappy"]), noOverlays)
		expect(model.rows[0]).toMatchObject({ kind: "note", text: "gh is unhappy", tone: "warning" })
	})

	test("empties out when every row is dismissed", () => {
		const model = notificationsRows(report([item({ id: "a" })]), { ...noOverlays, dismissed: new Set(["a"]) })
		expect(model.rows).toEqual([])
		expect(model.selectable).toEqual([])
	})
})

describe("optimistic overlays", () => {
	test("dismissal hides a row and read-marking clears its unread flag", () => {
		const items = [item({ id: "a" }), item({ id: "b" })]
		const visible = visibleNotifications(items, { unreadOnly: false, dismissed: new Set(["a"]), read: new Set(["b"]) })

		expect(visible.map((entry) => entry.id)).toEqual(["b"])
		expect(visible[0]?.unread).toBe(false)
		expect(unreadCount(visible)).toBe(0)
	})

	test("unread-only drops rows the overlay just marked read", () => {
		const visible = visibleNotifications([item({ id: "a" })], { unreadOnly: true, dismissed: new Set<string>(), read: new Set(["a"]) })
		expect(visible).toEqual([])
	})
})

describe("in-app openability", () => {
	test("accepts pull requests and issues with a number", () => {
		expect(isOpenableInApp(item({ subjectType: "PullRequest", number: 4 }))).toBe(true)
		expect(isOpenableInApp(item({ subjectType: "Issue", number: 4 }))).toBe(true)
	})

	test("rejects subjects phui has no surface for", () => {
		expect(isOpenableInApp(item({ subjectType: "Release", number: null }))).toBe(false)
		expect(isOpenableInApp(item({ subjectType: "PullRequest", number: null }))).toBe(false)
	})
})

describe("clampSelection", () => {
	test("stays inside the list and collapses to zero when empty", () => {
		expect(clampSelection(5, 3)).toBe(2)
		expect(clampSelection(-2, 3)).toBe(0)
		expect(clampSelection(4, 0)).toBe(0)
	})
})
