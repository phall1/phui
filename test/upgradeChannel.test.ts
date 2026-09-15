import { describe, expect, test } from "bun:test"
import { channelFromPath } from "../src/upgrade/channel.js"

const roots = {
	brewPrefix: "/opt/homebrew",
	npmRoot: "/Users/phall/.npm-global/lib/node_modules",
	pnpmHome: "/Users/phall/Library/pnpm",
	yarnGlobal: "/Users/phall/.yarn/global",
}

describe("channelFromPath", () => {
	test("source checkout", () => {
		expect(channelFromPath("/Users/phall/workspace/phui/src/standalone.ts", roots)).toBe("source")
	})

	test("Homebrew Cellar binary", () => {
		expect(channelFromPath("/opt/homebrew/Cellar/phui/0.17.0/bin/phui", roots)).toBe("brew")
	})

	test("Homebrew opt binary", () => {
		expect(channelFromPath("/opt/homebrew/opt/phui/bin/phui", roots)).toBe("brew")
	})

	test("npm global wrapper", () => {
		expect(channelFromPath("/Users/phall/.npm-global/lib/node_modules/@phall/phui/bin/phui.js", roots)).toBe("npm")
	})

	test("standalone download", () => {
		expect(channelFromPath("/Users/phall/.local/bin/phui", roots)).toBe("standalone")
	})
})
