import packageJson from "../package.json" with { type: "json" }
import { Effect } from "effect"
import { formatLaunchIntentError, LaunchIntentError, parseLaunchIntent } from "./launchIntent.js"
import { runUpgrade } from "./upgrade/index.js"

const help = `phui ${packageJson.version}

Terminal UI for GitHub pull requests.

Usage:
  phui [target] [--view <view>]
  phui upgrade
  phui -v, --version
  phui -h, --help

Targets:
  owner/repo                         Open a repository
  owner/repo#123                     Open a pull request
  https://github.com/owner/repo      Open a GitHub repository URL
  https://github.com/owner/repo/pull/123
                                     Open a GitHub pull request URL

Options:
  --view details|diff|comments|runs  Open a pull request view (default: details)

Commands:
  upgrade                            Upgrade phui to the latest release
  -v, --version                      Print the installed version
  -h, --help                         Show this help message
`

const args = Bun.argv.slice(2)
const command = args[0]

if (command === "-h" || command === "--help" || command === "help") {
	console.log(help)
	process.exit(0)
}

if (command === "-v" || command === "--version" || command === "version") {
	console.log(packageJson.version)
	process.exit(0)
}

if (command === "upgrade") {
	const exitCode = await Effect.runPromise(runUpgrade())
	process.exit(exitCode)
}

try {
	parseLaunchIntent(args)
} catch (error) {
	if (!(error instanceof LaunchIntentError)) throw error
	console.error(formatLaunchIntentError(error))
	process.exit(1)
}

await import("./index.js")
