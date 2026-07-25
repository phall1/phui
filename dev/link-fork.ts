// Point the global `phui` command at this checkout instead of the npm-published
// @kitlangton/ghui package. bin/phui.js falls back to running src/standalone.ts
// from source when it can't resolve a prebuilt platform binary, so linking here
// means `phui` always runs your fork's current code — no build step required.
//
// Usage: bun run link:fork

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "")

const capture = (cmd: string[]) => {
	const proc = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe" })
	return proc.stdout.toString().trim()
}

const pkg = await Bun.file(`${root}/package.json`).json()
const pkgName: string = pkg.name
const binName = Object.keys(pkg.bin)[0]

const globalBinDir = capture(["bun", "pm", "bin", "-g"])
if (!globalBinDir) {
	console.error("Could not resolve bun's global bin dir (`bun pm bin -g`). Is bun installed?")
	process.exit(1)
}
const globalModulesDir = `${globalBinDir.replace(/\/bin$/, "")}/install/global/node_modules`

await Bun.$`mkdir -p ${globalModulesDir}/${pkgName.split("/")[0]}`.quiet()
await Bun.$`ln -sfn ${root} ${globalModulesDir}/${pkgName}`.quiet()
await Bun.$`ln -sfn ${globalModulesDir}/${pkgName}/bin/${binName}.js ${globalBinDir}/${binName}`.quiet()

console.log(`Linked ${binName} -> ${root} (fork v${pkg.version})`)
console.log(`Verify with: which ${binName} && ${binName} --version`)
