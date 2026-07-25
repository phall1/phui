# Repository Notes

## Release Process

- Fork releases on `phall1/phui` use `.github/workflows/fork-publish.yml` and
  publish standalone binaries plus `phall1/tap/phui`; they do not publish npm.
- The upstream npm workflow is repository-gated and skips on the fork.

- Release workflow: `.github/workflows/publish.yml`.
- npm Trusted Publisher should be configured for owner `kitlangton`, repository `ghui`, workflow `publish.yml`, environment `npm`.
- Add a changeset for every user-facing change with `bun run changeset`.
- Check pending changesets with `bun run changeset:status`.
- Apply pending changesets with `bun run changeset:version`; this bumps `package.json` and updates `CHANGELOG.md` when release notes exist.
- Run `bun run format:check`, `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run package:smoke` before committing the version bump.
- Commit and push the version bump and consumed changesets to `main`.
- Create a GitHub release named and tagged `v<package.json version>`.
- Publishing to npm happens from GitHub Actions via trusted publishing; do not use an `NPM_TOKEN`.
- The workflow verifies the release tag matches `package.json`, builds standalone binaries, runs `npm publish`, uploads release assets, and dispatches `kitlangton/homebrew-tap`.
- Homebrew tap automation uses the `HOMEBREW_TAP_TOKEN` Actions secret on `kitlangton/ghui` to dispatch `kitlangton/homebrew-tap`.
- `HOMEBREW_TAP_TOKEN` should be a fine-grained PAT owned by `kitlangton`, scoped only to `kitlangton/homebrew-tap`, with repository `Contents: Read and write`.
- After releases, verify both the publish workflow and the tap dispatch workflow pass.

## Commands

- Format check: `bun run format:check`.
- Typecheck: `bun run typecheck`.
- Lint: `bun run lint`.
- Test: `bun run test`.
- Package smoke: `bun run package:smoke`.
- Create changeset: `bun run changeset`.
- Check changesets: `bun run changeset:status`.
- Apply changesets: `bun run changeset:version`.
- Create release: `gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes "..."`.
- Check publish run: `gh run list --workflow publish.yml --limit 5`.
- Check npm version: `npm view @kitlangton/ghui version`.
- Check tap workflow: `gh run list --repo kitlangton/homebrew-tap --workflow update-ghui.yml --limit 5`.
- Check Homebrew formula: `brew info kitlangton/tap/ghui`.
- Test Homebrew install: `brew reinstall kitlangton/tap/ghui && /opt/homebrew/opt/ghui/bin/ghui --version`.

## Commit Readiness

- Before committing or pushing code changes, run `bun run format:check`, `bun run typecheck`, `bun run lint`, and `bun run test`.
- Before release commits, also run `bun run package:smoke`.
- Before release commits, also run `bun run build:standalone`.
- If formatting fails, run `bunx oxfmt src/ test/ dev/` or format only the touched files, then rerun `bun run format:check`.
- CI enforces formatting with `bun run format:check`; do not rely on manual review to catch formatting drift.

## UI Conventions

- Modal dividers must connect to the side borders with junction characters (`├` / `┤`). When adding a horizontal divider inside a modal body, thread the divider's row index through `ModalFrame`'s `junctionRows` so the side bars render `├`/`┤` at that row instead of `│`. Inline `<Divider>`s without a corresponding junction row look detached and are wrong.

## Plans

Larger features and redesigns are captured in markdown under `plans/` before work starts. Each plan has Why / What / API mapping / Open questions / Status. When taking on something non-trivial, check `plans/` first; when sketching a future-direction idea, write a plan there rather than only mentioning it in chat or commits. See `plans/README.md` for the format and index.

## Future Work

- Add a conversation panel focus/expand flow for reading and navigating longer PR conversations.
- Consider click-drag support in diffs to select a comment range.
- See `plans/` for tracked feature plans (e.g. queued PR reviews).

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
