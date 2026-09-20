import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { pullRequestMergeMethods } from "../src/domain.js"
import { GitHubService } from "../src/services/GitHubService.js"
import { mergeQueueCommandLayer } from "./fixtures/mergeQueue.js"

describe("GitHubService merge queue", () => {
	for (const queueEnabled of [false, true]) {
		for (const kind of ["now", "auto", "admin"] as const) {
			for (const method of pullRequestMergeMethods) {
				test(`${queueEnabled ? "queue" : "ordinary"} ${kind} ${method} uses safe merge flags`, async () => {
					const calls: string[][] = []
					const layer = GitHubService.layerNoDeps.pipe(Layer.provide(mergeQueueCommandLayer({ queueEnabled }, calls)))
					await Effect.runPromise(
						GitHubService.use((github) =>
							Effect.gen(function* () {
								const info = yield* github.getPullRequestMergeInfo("example/queue-demo", 42)
								yield* github.mergePullRequest(info.repository, info.number, { kind, method, mergeQueueEnabled: info.mergeQueueEnabled })
								expect(info.mergeQueueEnabled).toBe(queueEnabled)
							}),
						).pipe(Effect.provide(layer)),
					)
					const mergeCall = calls.find((call) => call[1] === "pr" && call[2] === "merge")
					expect(mergeCall).toEqual([
						"gh",
						"pr",
						"merge",
						"42",
						"--repo",
						"example/queue-demo",
						`--${method}`,
						...(kind === "now" ? [] : [`--${kind}`]),
						...(queueEnabled ? [] : ["--delete-branch"]),
					])
					expect(calls.find((call) => call[1] === "api" && call[2] === "graphql")?.find((arg) => arg.startsWith("query="))).toContain("mergeQueue { id }")
				})
			}
		}
	}

	test("disabling auto-merge is unchanged", async () => {
		const calls: string[][] = []
		await Effect.runPromise(
			GitHubService.use((github) => github.mergePullRequest("example/queue-demo", 42, { kind: "disable-auto" })).pipe(
				Effect.provide(GitHubService.layerNoDeps.pipe(Layer.provide(mergeQueueCommandLayer({ queueEnabled: true }, calls)))),
			),
		)
		expect(calls.filter((call) => call[1] === "pr")).toEqual([["gh", "pr", "merge", "42", "--repo", "example/queue-demo", "--disable-auto"]])
	})
})
