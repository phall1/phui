import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { act, useState } from "../src/solid-hooks.js"
import { useItemLoadMore, type UseItemLoadMoreResult } from "../src/hooks/useItemLoadMore.ts"

interface TestLoad {
	readonly data: readonly number[]
	readonly endCursor: string | null
}

const deferred = <Value,>() => {
	let resolve!: (value: Value) => void
	const promise = new Promise<Value>((res) => {
		resolve = res
	})
	return { promise, resolve }
}

const settle = () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))

describe("useItemLoadMore", () => {
	test("rejects duplicate starts in the same tick", async () => {
		const page = deferred<readonly number[]>()
		const generation = { current: 0 }
		let fetches = 0
		let cache: Partial<Record<string, TestLoad>> = { A: { data: [1], endCursor: "cursor-1" } }
		let result!: UseItemLoadMoreResult

		const Harness = () => {
			const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
			result = useItemLoadMore({
				cacheKey: "A",
				load: cache.A ?? null,
				hasMore: true,
				fetchInFlight: false,
				itemLimit: 10,
				pageSize: 5,
				refreshGenerationRef: generation,
				loadingMoreKey,
				setLoadingMoreKey,
				fetchPage: () => {
					fetches += 1
					return page.promise
				},
				mergePage: (current, incoming) => ({ ...current, data: [...current.data, ...incoming] }),
				setLoadCache: (update) => {
					cache = update(cache)
				},
				persistLoad: () => {},
				flashNotice: () => {},
				timeoutMessage: "timed out",
			})
			return null
		}

		const setup = await testRender(() => <Harness />, { width: 1, height: 1 })
		act(() => {
			expect(result.loadMore()).toBe(true)
			expect(result.loadMore()).toBe(false)
		})
		expect(fetches).toBe(1)

		page.resolve([2])
		await act(settle)
		expect(cache.A?.data).toEqual([1, 2])
		setup.renderer.destroy()
	})

	test("a bumped generation drops an in-flight page", async () => {
		const page = deferred<readonly number[]>()
		const generation = { current: 0 }
		let cache: Partial<Record<string, TestLoad>> = { A: { data: [1], endCursor: "cursor-1" } }
		let result!: UseItemLoadMoreResult

		const Harness = () => {
			const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
			result = useItemLoadMore({
				cacheKey: "A",
				load: cache.A ?? null,
				hasMore: true,
				fetchInFlight: false,
				itemLimit: 10,
				pageSize: 5,
				refreshGenerationRef: generation,
				loadingMoreKey,
				setLoadingMoreKey,
				fetchPage: () => page.promise,
				mergePage: (current, incoming) => ({ ...current, data: [...current.data, ...incoming] }),
				setLoadCache: (update) => {
					cache = update(cache)
				},
				persistLoad: () => {},
				flashNotice: () => {},
				timeoutMessage: "timed out",
			})
			return null
		}

		const setup = await testRender(() => <Harness />, { width: 1, height: 1 })
		expect(result.loadMore()).toBe(true)
		generation.current += 1
		result.resetLoadingMore()
		page.resolve([2])
		await act(settle)
		expect(cache.A?.data).toEqual([1])
		setup.renderer.destroy()
	})
})
