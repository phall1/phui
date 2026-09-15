import { createSolidTransformPlugin } from "../node_modules/@opentui/solid/scripts/solid-plugin.js"

export const compilePhuiBinary = async (outfile: string, bunTarget: string) => {
	const result = await Bun.build({
		entrypoints: ["src/standalone.ts"],
		plugins: [createSolidTransformPlugin()],
		target: "bun",
		format: "esm",
		compile: {
			outfile,
			target: bunTarget as "bun-darwin-arm64" | "bun-darwin-x64" | "bun-linux-arm64" | "bun-linux-x64",
		},
	})
	if (!result.success) {
		const details = result.logs.map((log) => String(log)).join("\n")
		throw new Error(`Standalone compile failed for ${bunTarget}:\n${details}`)
	}
}
