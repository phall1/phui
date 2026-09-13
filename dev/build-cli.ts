const result = await Bun.build({
	entrypoints: ["src/index.tsx"],
	external: ["@effect/atom-solid", "@opentui/core", "@opentui/solid", "@opentui/solid/jsx-dev-runtime", "@opentui/solid/jsx-runtime", "effect", "solid-js"],
	format: "esm",
	outdir: "dist",
	target: "bun",
})

if (!result.success) {
	for (const log of result.logs) console.error(log)
	process.exit(1)
}
