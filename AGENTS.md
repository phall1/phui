# Repository Notes

## Release Process

- Fork releases on `phall1/phui` are fully automated with release-please
  (`.github/workflows/release-please.yml`); there are no manual version bumps
  or `gh release create` steps.
- Versioning is driven by Conventional Commit messages on `main`: `fix:` bumps
  patch, `feat:` bumps minor, and breaking changes bump minor while pre-1.0
  (`bump-minor-pre-major`). Commits like `chore:`/`refactor:` do not trigger a
  release on their own.
- Every push to `main` opens or updates the release PR, which accumulates the
  pending version bump and `CHANGELOG.md` entries.
- Merging the release PR bumps `package.json`, updates `CHANGELOG.md`, tags
  `v<version>`, creates the GitHub release, and calls
  `.github/workflows/fork-publish.yml` (via `workflow_call`, because releases
  created with the workflow token do not emit a `release` event) to build
  standalone binaries, publish npm, and dispatch `phall1/homebrew-tap`.
- Do not hand-edit the `package.json` version or `CHANGELOG.md`;
  release-please owns both, and `.release-please-manifest.json` tracks the
  last released version.
- Homebrew tap automation uses the `HOMEBREW_TAP_TOKEN` Actions secret on
  `phall1/phui`: a fine-grained PAT scoped to `phall1/homebrew-tap` with
  repository `Contents: Read and write`.
- After merging a release PR, verify the `Release Please` run (including the
  called publish jobs and tap dispatch) passes.
- The upstream npm workflow (`.github/workflows/publish.yml`) is
  repository-gated to `kitlangton/ghui` and skips on the fork. Do not un-gate
  it; fork publishing lives in `fork-publish.yml`, which is fork-owned and does
  not conflict on merge.

### npm

- The fork publishes to npm as **`@phall1/phui`**. It is scoped because the
  unscoped `phui` name belongs to an unrelated package (`phui@3.x`, a front-end
  component library) and cannot be used. The four per-platform binary packages
  derive from it automatically (`@phall1/phui-darwin-arm64`, ...) via
  `binaryPackageName` in `dev/release-targets.ts`.
- Publishing needs an `NPM_TOKEN` repository secret. Without it a release still
  publishes binaries and Homebrew and emits a workflow warning rather than
  failing. Provenance comes from `id-token: write` (the Actions OIDC token),
  not from how npm is authenticated, so a token publish is still signed.
- OIDC/trusted publishing cannot perform a package's *first* publish — npm
  requires the package to exist before a trusted publisher can be attached. Once
  the packages exist, configure trusted publishing per package and delete the
  token.
- Nothing in `dev/` should hard-code the package name; `dev/package-smoke.ts`
  derives `node_modules` paths from `package.json`, because a scoped package
  installs to `node_modules/@scope/name`.

### Homebrew tap

- `phall1/homebrew-tap` is generated: `tools/<tool>.json` plus
  `.github/scripts/render/<tool>.sh`, driven by one `update-packages.yml`.
- The tap update is a bare `repository_dispatch` (`tap-release`, with
  `client_payload[tool]=phui`). Do not send checksums: the tap re-resolves the
  release and recomputes every digest itself, so a forwarded payload would be
  both ignored and untrustworthy.
- The tap also polls hourly, so a failed dispatch (usually an expired
  `HOMEBREW_TAP_TOKEN`) delays the formula by up to an hour rather than
  stranding it. Check the tap's `Update packages` workflow before assuming a
  release did not land.

## Commands

- Format check: `bun run format:check`.
- Typecheck: `bun run typecheck`.
- Lint: `bun run lint`.
- Test: `bun run test`.
- Package smoke: `bun run package:smoke`.
- Find the open release PR: `gh pr list --label "autorelease: pending"`.
- Check release runs: `gh run list --workflow release-please.yml --limit 5`.
- Check npm version: `npm view @phall1/phui version`.
- Check tap workflow: `gh run list --repo phall1/homebrew-tap --workflow update-packages.yml --limit 5`.
- Check Homebrew formula: `brew info phall1/tap/phui`.
- Test Homebrew install: `brew reinstall phall1/tap/phui && /opt/homebrew/opt/phui/bin/phui --version`.

## Commit Readiness

- Before committing or pushing code changes, run `bun run format:check`, `bun run typecheck`, `bun run lint`, and `bun run test`.
- Release commits are authored by release-please; the publish workflow runs
  `package:smoke` and `build:standalone` before uploading assets.
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
