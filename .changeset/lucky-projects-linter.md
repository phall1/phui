---
"@kitlangton/ghui": minor
---

Add a PROJECTS surface (`4`): a linter over the repositories in your configured scan roots. It reports uncommitted-and-stale work, unpushed branches with no open PR, red CI on the default branch, duplicate clones, stale worktrees, and stray directories — findings first, grouped by check, most severe at the top. `a` toggles the full inventory (branch, dirty count, last-commit age, lifecycle, remote), `r` rescans, `enter` opens the finding's run URL or its directory. Scan roots and per-project intent come from `$XDG_CONFIG_HOME/ghui/projects.toml`; with nothing configured the surface shows a setup hint with the exact TOML to paste, and never guesses a directory. GitHub-dependent checks degrade silently when `gh` is unavailable.
