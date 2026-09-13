import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { CommandRunner, type CommandResult } from "../src/services/CommandRunner.ts"
import { GitHubService } from "../src/services/GitHubService.ts"

interface RecordedCall {
	readonly command: string
	readonly args: readonly string[]
}

const fakeCommandRunner = (handler: (args: readonly string[]) => string, recorder: RecordedCall[]) =>
	Layer.succeed(
		CommandRunner,
		CommandRunner.of({
			run: (command, args) => {
				recorder.push({ command, args: [...args] })
				const result: CommandResult = { stdout: handler(args), stderr: "", exitCode: 0 }
				return Effect.succeed(result)
			},
			runSchema: <S extends Schema.Top>(schema: S, command: string, args: readonly string[]) => {
				recorder.push({ command, args: [...args] })
				return Effect.try({
					try: () => JSON.parse(handler(args)) as unknown,
					catch: (cause) => cause,
				}).pipe(Effect.flatMap((value) => Schema.decodeUnknownEffect(schema)(value))) as Effect.Effect<S["Type"], never, S["DecodingServices"]>
			},
		}),
	)

const runWith = <A>(effect: Effect.Effect<A, unknown, GitHubService>, handler: (args: readonly string[]) => string, recorder: RecordedCall[]) =>
	Effect.runPromise(effect.pipe(Effect.provide(GitHubService.layerNoDeps.pipe(Layer.provide(fakeCommandRunner(handler, recorder))))) as Effect.Effect<A>)

const operationCall = (recorder: readonly RecordedCall[], predicate: (args: readonly string[]) => boolean) => {
	const call = recorder.find((entry) => predicate(entry.args))
	if (!call) throw new Error(`Expected a matching GitHub call, got ${JSON.stringify(recorder.map((entry) => entry.args))}`)
	return call
}

const jsonHandler =
	(byPath: Record<string, unknown>, fallback: unknown = { login: "kit" }) =>
	(args: readonly string[]) => {
		if (args[0] === "api" && args[1] === "user") return JSON.stringify({ login: "kit" })
		const path = args.find((arg) => arg.startsWith("repos/") || arg.startsWith("query=")) ?? args.join(" ")
		for (const [key, value] of Object.entries(byPath)) {
			if (path.includes(key) || args.join(" ").includes(key)) return JSON.stringify(value)
		}
		return JSON.stringify(fallback)
	}

const commentInput = {
	repository: "owner/repo",
	number: 12,
	commitId: "abc",
	path: "src/a.ts",
	line: 4,
	side: "RIGHT" as const,
	body: "queued note",
}

describe("GitHubService issue list cost", () => {
	test("issue list query omits body", async () => {
		const recorder: RecordedCall[] = []
		const page = await runWith(
			GitHubService.use((github) => github.listIssuePage({ kind: "issue", mode: "authored", repository: null, cursor: null, pageSize: 1 })),
			jsonHandler({
				"query Issues": {
					data: {
						search: {
							nodes: [
								{
									number: 8,
									title: "Cheap issue list",
									state: "OPEN",
									createdAt: "2026-01-01T00:00:00Z",
									updatedAt: "2026-01-01T00:00:00Z",
									closedAt: null,
									url: "https://github.com/owner/repo/issues/8",
									author: { login: "kit" },
									repository: { nameWithOwner: "owner/repo", defaultBranchRef: { name: "main" } },
									labels: { nodes: [] },
									comments: { totalCount: 0 },
								},
							],
							pageInfo: { hasNextPage: false, endCursor: null },
						},
					},
				},
			}),
			recorder,
		)
		expect(page.items).toHaveLength(1)
		expect(page.items[0]!.body).toBe("")
		const queryArg = operationCall(recorder, (args) => args.some((arg) => arg.startsWith("query="))).args.find((arg) => arg.startsWith("query=")) ?? ""
		expect(queryArg).not.toMatch(/\bbody\b/)
	})
})

describe("GitHubService pending reviews", () => {
	test("findPendingReview GETs reviews then pending comments", async () => {
		const recorder: RecordedCall[] = []
		const pending = await runWith(
			GitHubService.use((github) => github.findPendingReview("owner/repo", 12)),
			jsonHandler({
				"pulls/12/reviews/42/comments": [{ id: 9, user: { login: "kit" }, body: "queued note", path: "src/a.ts", line: 4, side: "RIGHT", created_at: "2026-01-01T00:00:00Z" }],
				"pulls/12/reviews": [{ id: 42, state: "PENDING", commit_id: "abc" }],
			}),
			recorder,
		)

		expect(pending?.id).toBe("42")
		expect(pending?.comments).toHaveLength(1)
		expect(operationCall(recorder, (args) => args.includes("repos/owner/repo/pulls/12/reviews")).args).toContain("--paginate")
		expect(operationCall(recorder, (args) => args.some((arg) => arg.includes("/reviews/42/comments"))).args[0]).toBe("api")
	})

	test("createPendingReview POSTs a pending review", async () => {
		const recorder: RecordedCall[] = []
		const created = await runWith(
			GitHubService.use((github) => github.createPendingReview("owner/repo", 12, "abc")),
			jsonHandler({ "pulls/12/reviews": { id: 7, node_id: "PRR_kwDO", commit_id: "abc" } }),
			recorder,
		)
		expect(created.id).toBe("7")
		expect(created.nodeId).toBe("PRR_kwDO")
		expect(operationCall(recorder, (args) => args.includes("POST") && args.includes("repos/owner/repo/pulls/12/reviews")).args).toEqual([
			"api",
			"--method",
			"POST",
			"repos/owner/repo/pulls/12/reviews",
			"-f",
			"commit_id=abc",
		])
	})

	test("addPendingReviewComment uses GraphQL addPullRequestReviewThread", async () => {
		const recorder: RecordedCall[] = []
		const comment = await runWith(
			GitHubService.use((github) => github.addPendingReviewComment("owner/repo", 12, "PRR_kwDO", commentInput)),
			jsonHandler({
				AddPendingReviewThread: {
					data: {
						addPullRequestReviewThread: {
							thread: {
								comments: {
									nodes: [{ databaseId: 11, body: "queued note", createdAt: "2026-01-01T00:00:00Z", author: { login: "kit" }, path: "src/a.ts", line: 4, diffSide: "RIGHT" }],
								},
							},
						},
					},
				},
			}),
			recorder,
		)
		expect(comment.id).toBe("11")
		expect(comment.body).toBe("queued note")
		const args = operationCall(recorder, (args) => args.some((arg) => arg.includes("addPullRequestReviewThread"))).args
		expect(args).toContain("api")
		expect(args).toContain("graphql")
		expect(args).toContain("reviewId=PRR_kwDO")
		expect(args).toContain("path=src/a.ts")
		expect(args).toContain("body=queued note")
	})

	test("queuePendingDiffComment creates a pending review then GraphQL-adds the thread", async () => {
		const recorder: RecordedCall[] = []
		const queued = await runWith(
			GitHubService.use((github) => github.queuePendingDiffComment(commentInput)),
			(args) => {
				if (args[0] === "api" && args[1] === "user") return JSON.stringify({ login: "kit" })
				if (args.includes("graphql")) {
					return JSON.stringify({
						data: {
							addPullRequestReviewThread: {
								thread: {
									comments: {
										nodes: [{ databaseId: 11, body: "queued note", createdAt: "2026-01-01T00:00:00Z", author: { login: "kit" }, path: "src/a.ts", line: 4, diffSide: "RIGHT" }],
									},
								},
							},
						},
					})
				}
				if (args.includes("POST") && args.some((arg) => arg.includes("pulls/12/reviews"))) {
					return JSON.stringify({ id: 7, node_id: "PRR_kwDO", commit_id: "abc" })
				}
				if (args.some((arg) => arg.includes("/reviews"))) return JSON.stringify([])
				return JSON.stringify({ login: "kit" })
			},
			recorder,
		)
		expect(queued.comment.id).toBe("11")
		expect(queued.pending.nodeId).toBe("PRR_kwDO")
		expect(queued.pending.comments).toHaveLength(1)
		expect(operationCall(recorder, (args) => args.includes("POST") && args.some((arg) => arg.includes("pulls/12/reviews"))).args).toContain("commit_id=abc")
		const graphql = operationCall(recorder, (args) => args.some((arg) => arg.includes("addPullRequestReviewThread"))).args
		expect(graphql).toContain("graphql")
		expect(graphql).toContain("reviewId=PRR_kwDO")
		expect(recorder.filter((call) => call.args.includes("POST") && call.args.some((arg) => arg.includes("/reviews/") && arg.includes("/comments")))).toHaveLength(0)
	})

	test("queuePendingDiffComment reuses an existing pending review GraphQL node id", async () => {
		const recorder: RecordedCall[] = []
		const queued = await runWith(
			GitHubService.use((github) => github.queuePendingDiffComment(commentInput)),
			jsonHandler({
				"pulls/12/reviews/42/comments": [],
				"pulls/12/reviews": [{ id: 42, state: "PENDING", node_id: "PRR_existing", commit_id: "abc" }],
				addPullRequestReviewThread: {
					data: {
						addPullRequestReviewThread: {
							thread: {
								comments: {
									nodes: [{ databaseId: 11, body: "queued note", createdAt: "2026-01-01T00:00:00Z", author: { login: "kit" }, path: "src/a.ts", line: 4, diffSide: "RIGHT" }],
								},
							},
						},
					},
				},
			}),
			recorder,
		)
		expect(queued.pending.id).toBe("42")
		expect(queued.pending.nodeId).toBe("PRR_existing")
		expect(operationCall(recorder, (args) => args.some((arg) => arg.includes("addPullRequestReviewThread"))).args).toContain("reviewId=PRR_existing")
		expect(recorder.filter((call) => call.args.includes("POST") && call.args.some((arg) => arg.includes("pulls/12/reviews")))).toHaveLength(0)
	})

	test("submitPendingReview and discardPendingReview hit review events / DELETE", async () => {
		const recorder: RecordedCall[] = []
		await runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.submitPendingReview("owner/repo", 12, "7", "APPROVE", "lgtm")
					yield* github.discardPendingReview("owner/repo", 12, "7")
				}),
			),
			(args) => (args[0] === "api" && args[1] === "user" ? JSON.stringify({ login: "kit" }) : ""),
			recorder,
		)
		expect(operationCall(recorder, (args) => args.some((arg) => arg.includes("/reviews/7/events"))).args).toEqual([
			"api",
			"--method",
			"POST",
			"repos/owner/repo/pulls/12/reviews/7/events",
			"-f",
			"event=APPROVE",
			"-f",
			"body=lgtm",
		])
		expect(operationCall(recorder, (args) => args.includes("DELETE") && args.includes("repos/owner/repo/pulls/12/reviews/7")).args).toEqual([
			"api",
			"--method",
			"DELETE",
			"repos/owner/repo/pulls/12/reviews/7",
		])
	})
})

describe("GitHubService review threads", () => {
	test("listReviewThreads and resolve/unresolve use GraphQL thread ids", async () => {
		const recorder: RecordedCall[] = []
		const threads = await runWith(
			GitHubService.use((github) => github.listReviewThreads("owner/repo", 12)),
			jsonHandler({
				ReviewThreads: {
					data: { repository: { pullRequest: { reviewThreads: { nodes: [{ id: "PRRT_1", isResolved: false, comments: { nodes: [{ databaseId: 99 }] } }] } } } },
				},
			}),
			recorder,
		)
		expect(threads).toEqual([{ id: "PRRT_1", isResolved: false, rootCommentId: "99" }])

		await runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.resolveReviewThread("PRRT_1")
					yield* github.unresolveReviewThread("PRRT_1")
				}),
			),
			jsonHandler({
				ResolveThread: { data: { resolveReviewThread: { thread: { id: "PRRT_1", isResolved: true } } } },
				UnresolveThread: { data: { unresolveReviewThread: { thread: { id: "PRRT_1", isResolved: false } } } },
			}),
			recorder,
		)
		expect(operationCall(recorder, (args) => args.some((arg) => arg.includes("resolveReviewThread"))).args).toContain("id=PRRT_1")
		expect(operationCall(recorder, (args) => args.some((arg) => arg.includes("unresolveReviewThread"))).args).toContain("id=PRRT_1")
	})
})

describe("GitHubService collaborators and lifecycle", () => {
	test("requests reviewers and assignees via gh pr edit", async () => {
		const recorder: RecordedCall[] = []
		await runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.addReviewers("owner/repo", 12, ["kit", "org/core"])
					yield* github.removeReviewers("owner/repo", 12, ["kit"])
					yield* github.addAssignees("owner/repo", 12, ["alice"])
					yield* github.removeAssignees("owner/repo", 12, ["alice"])
				}),
			),
			() => "",
			recorder,
		)
		expect(operationCall(recorder, (args) => args.includes("--add-reviewer") && args.includes("kit")).args).toContain("org/core")
		expect(operationCall(recorder, (args) => args.includes("--remove-reviewer")).args).toContain("kit")
		expect(operationCall(recorder, (args) => args.includes("--add-assignee")).args).toContain("alice")
		expect(operationCall(recorder, (args) => args.includes("--remove-assignee")).args).toContain("alice")
	})

	test("updatePullRequestBranch PUTs update-branch", async () => {
		const recorder: RecordedCall[] = []
		await runWith(
			GitHubService.use((github) => github.updatePullRequestBranch("owner/repo", 12)),
			jsonHandler({ "update-branch": { message: "Updating pull request branch." } }),
			recorder,
		)
		expect(operationCall(recorder, (args) => args.includes("repos/owner/repo/pulls/12/update-branch")).args).toEqual([
			"api",
			"--method",
			"PUT",
			"repos/owner/repo/pulls/12/update-branch",
		])
	})

	test("reopen, edit title/body, and create PR hit gh pr flags", async () => {
		const recorder: RecordedCall[] = []
		const created = await runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.reopenPullRequest("owner/repo", 12)
					yield* github.reopenIssue("owner/repo", 3)
					yield* github.editPullRequestTitleBody("owner/repo", 12, "New title", "New body")
					return yield* github.createPullRequest({
						repository: "owner/repo",
						title: "Add it",
						body: "why",
						base: "main",
						head: "feat",
						draft: true,
					})
				}),
			),
			(args) => {
				if (args[0] === "api" && args[1] === "user") return JSON.stringify({ login: "kit" })
				if (args[0] === "pr" && args[1] === "create") return JSON.stringify({ number: 13, url: "https://github.com/owner/repo/pull/13", title: "Add it" })
				return ""
			},
			recorder,
		)
		expect(created).toEqual({ repository: "owner/repo", number: 13, url: "https://github.com/owner/repo/pull/13", title: "Add it" })
		expect(operationCall(recorder, (args) => args[0] === "pr" && args[1] === "reopen").args).toEqual(["pr", "reopen", "12", "--repo", "owner/repo"])
		expect(operationCall(recorder, (args) => args[0] === "issue" && args[1] === "reopen").args).toEqual(["issue", "reopen", "3", "--repo", "owner/repo"])
		expect(operationCall(recorder, (args) => args.includes("--title")).args).toContain("New title")
		expect(operationCall(recorder, (args) => args[1] === "create").args).toContain("--draft")
	})

	test("listPullRequestTimeline queries review and merge events", async () => {
		const recorder: RecordedCall[] = []
		const events = await runWith(
			GitHubService.use((github) => github.listPullRequestTimeline("owner/repo", 12)),
			jsonHandler({
				PullRequestTimeline: {
					data: {
						repository: {
							pullRequest: {
								timelineItems: {
									nodes: [
										{ __typename: "PullRequestReview", id: "r1", author: { login: "kit" }, body: "lgtm", state: "APPROVED", createdAt: "2026-01-01T00:00:00Z" },
										{ __typename: "MergedEvent", id: "m1", actor: { login: "alice" }, createdAt: "2026-01-02T00:00:00Z" },
									],
								},
							},
						},
					},
				},
			}),
			recorder,
		)
		expect(events.map((event) => event.kind)).toEqual(["review", "merged"])
		const queryArg = operationCall(recorder, (args) => args.some((arg) => arg.includes("PullRequestTimeline"))).args.find((arg) => arg.startsWith("query=")) ?? ""
		expect(queryArg).toContain("PULL_REQUEST_REVIEW")
		expect(queryArg).toContain("MERGED_EVENT")
	})

	test("getWorkflowRunLogs uses gh run view --log-failed", async () => {
		const recorder: RecordedCall[] = []
		const logs = await runWith(
			GitHubService.use((github) => github.getWorkflowRunLogs("owner/repo", 88, true)),
			(args) => (args[0] === "api" && args[1] === "user" ? JSON.stringify({ login: "kit" }) : "job / step\nerror: boom\n"),
			recorder,
		)
		expect(logs).toContain("error: boom")
		expect(operationCall(recorder, (args) => args[0] === "run" && args[1] === "view").args).toEqual(["run", "view", "88", "--repo", "owner/repo", "--log-failed"])
	})
})
