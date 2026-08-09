# phui

> **A fork of [ghui](https://github.com/kitlangton/ghui) by
> [Kit Langton](https://github.com/kitlangton).** The application, its design,
> and the great majority of the code are his work — this fork stands entirely on
> it. If you want the original, that's
> [`@kitlangton/ghui`](https://www.npmjs.com/package/@kitlangton/ghui), and it's
> the one to star. See [credits](#credits-and-license) for what this fork adds
> and why it exists separately.

Terminal UI for keeping up with GitHub pull requests, issues, diffs, and Actions across repositories.

`phui` gives you one keyboard-driven place to triage your GitHub notifications, browse your starred repositories, review PR details, inspect diffs, monitor and control Actions, leave diff comments, manage labels, toggle draft state, merge, open PRs in GitHub, and copy PR metadata without leaving the terminal.

<img width="1420" height="856" alt="image" src="https://github.com/user-attachments/assets/5e560a4a-5887-4baa-a6d4-e1f4f0410c70" />

## Install

Homebrew is the recommended install path on macOS and Linux. It installs a standalone `phui` binary, so you do not need Bun or npm at runtime.

```bash
brew install phall1/tap/phui
```

Upgrade with:

```bash
brew upgrade phui
```

Or install from npm — the package ships a prebuilt binary per platform, so
Bun is not needed at runtime:

```bash
npm install -g @phall/phui
```

Any npm-compatible client works, since they all install from the same registry:

```bash
pnpm add -g @phall/phui
bun add -g @phall/phui
yarn global add @phall/phui
```

To try it without installing anything:

```bash
npx @phall/phui
bunx @phall/phui
```

The package is scoped because the unscoped `phui` name on npm belongs to an
unrelated project.

This fork publishes standalone binaries and the `phall1/tap` formula from
`phall1/phui`. The upstream npm release remains available separately:

```bash
npm install -g @kitlangton/ghui
```

Requirements:

- GitHub CLI installed and authenticated with `gh auth login`

Run it from anywhere:

```bash
phui
```

## Target a repository or pull request

Ordinary `phui` startup still needs only the authenticated `gh` CLI. You can
also open an exact repository or pull request at startup:

```bash
phui owner/repo
phui owner/repo#123 --view diff
phui https://github.com/owner/repo/pull/123 --view comments
```

For pull requests, `--view` accepts `details`, `diff`, `comments`, or `runs`
and defaults to `details`. GitHub repository URLs are also accepted.

## Optional phux handoff

[`phux`](https://github.com/phall1/phux) is optional. With phux 0.3.0 or
newer, an agent can open phui beside its pane without installing a plugin:

```bash
phux spawn --target @7 --split vertical -c /path/to/repo -- \
  phui owner/repo#123 --view diff
phux ask @7 --id owner-repo-123-review \
  "owner/repo#123 is ready for review"
```

`phux ask` is the advisory human checkpoint. Agents should read and update
semantic review state through `gh` or the GitHub API, not by scraping or
keyboard-driving the phui screen.

This repository also ships a small, optional launch template for people who
prefer `phux launch`. Linking and enabling it is a manual setup step from a
phui checkout:

```bash
phux plugin link ./phux-plugin/phux-plugin.toml
phux plugin enable phui
phux launch phui --target @7 --split vertical -c /path/to/repo -- \
  owner/repo#123 --view diff
```

The template runs `phui` in the directory where `phux launch` is invoked
(`working_directory = "workspace"`); `-c` overrides that workspace for the
example above. Homebrew installs the phui binary, not this optional phux
plugin.

## Local Development

Clone, install, and link:

```bash
git clone https://github.com/phall1/phui.git
cd phui
bun install
bun link
```

With Nix flakes:

```bash
nix develop
bun install
bun run dev
```

## Configuration

- `PHUI_PR_FETCH_LIMIT`: max PRs fetched, defaults to `200`
- `PHUI_RUN_FETCH_LIMIT`: max workflow runs fetched per PR or repository Actions view, defaults to `20`

Example:

```bash
PHUI_PR_FETCH_LIMIT=100 phui
```

You can also copy `.env.example` to `.env` and edit the values locally.

phui stores UI preferences in `config.json` under `PHUI_CONFIG_DIR` when set,
otherwise under the platform config directory. On Linux this is normally
`~/.config/phui/config.json`.

Example:

```json
{
	"theme": "system",
	"systemThemeAutoReload": true,
	"showScrollbars": false
}
```

`systemThemeAutoReload` defaults to `false`. Set it to `true` to let external
theme reload signals update the active system theme palette while phui is
running.

Scrollable panes hide their scrollbar rails by default. Set `showScrollbars`
to `true` to display them while retaining the same keyboard and mouse scrolling
behavior.

### Open in editor

Press `e` on a pull request (in the list, detail, or diff view) to hand it off
to your editor. phui suspends the TUI, runs your command attached to the
terminal, and resumes when it exits.

Configure this in `config.json`:

```json
{
	"editorCommand": "tmux new-window -c {{repoPath}} 'gh pr checkout {{number}} && nvim -c \":DiffviewOpen {{baseRef}}...{{headRef}}\"'",
	"repoPaths": {
		"kitlangton/ghui": "~/code/ghui",
		"kitlangton/*": "~/code/repos/kitlangton/*",
		":owner/:repo": "~/src/github.com/:owner/:repo"
	}
}
```

`repoPaths` maps a repository to a local clone, matched in order: an exact
`owner/repo` key, then an owner wildcard (`owner/*`, where `*` becomes the repo
name), then the generic `:owner/:repo` template. `~` expands to your home
directory.

`editorCommand` is a shell command template with these substitutions:

- `{{repo}}` — full `owner/repo`
- `{{owner}}`, `{{name}}`
- `{{number}}` — PR number
- `{{headRef}}` — PR head branch
- `{{baseRef}}` — base branch
- `{{author}}`
- `{{url}}`
- `{{repoPath}}` — resolved local path (requires a matching `repoPaths` entry)

If `editorCommand` is omitted, phui falls back to `$VISUAL`/`$EDITOR` opening
the resolved `repoPath`. Some common recipes:

```jsonc
// diffview.nvim: checkout the branch and diff against base
"editorCommand": "tmux new-window -c {{repoPath}} 'gh pr checkout {{number}} && nvim -c \":DiffviewOpen {{baseRef}}...{{headRef}}\"'"

// octo.nvim: review via the GitHub API (no checkout)
"editorCommand": "tmux new-window -c {{repoPath}} 'nvim -c \":silent Octo pr edit {{number}}\"'"

// VS Code
"editorCommand": "code {{repoPath}}"
```

### Open in a phux worktree

Press `w` on a pull request (list or detail view) to check its head out into an
isolated [git worktree](https://git-scm.com/docs/git-worktree) and open a
phux session there — the primary clone's
checkout is never touched, and each PR gets its own session named
`<repo>-pr-<number>`.

- Outside phux, phui suspends the TUI and attaches to the session directly;
  detaching drops you back into phui.
- Inside phux (detected via `PHUX_TERMINAL_ID`), the session is created
  detached and a footer notice tells you it's ready to switch to.

The local clone comes from the same `repoPaths` map used by open-in-editor.
The worktree fetches `refs/pull/<number>/head` from the remote matching the
PR's repository (so fork PRs work without adding the fork as a remote) and
checks it out on a local `pr/<number>` branch. Pressing `w` again on the same
PR reuses the existing worktree and session.

By default worktrees live at `{{repoPath}}/.phui/worktrees/pr-{{number}}`
(phui adds `.phui/` to the clone's `.git/info/exclude` so they never appear in
`git status`). Override the location with a `worktreePath` template in
`config.json`, using the same substitutions as `editorCommand`:

```json
{
	"worktreePath": "~/worktrees/{{name}}/pr-{{number}}"
}
```

### Inbox

Press `4` (or `g n`) for your GitHub notifications, grouped by what they want
from you rather than by repository or time:

- **NEEDS YOU** — review requested, approval requested, assigned, mentioned,
  team mentioned, invited
- **YOUR THREADS** — activity on things you opened
- **CI** — workflow activity
- **SECURITY** — Dependabot and advisory alerts
- **WATCHING** — everything you are merely subscribed to

`enter` opens a pull request **in phui** — the repository is scoped, the PR is
hydrated, and you land on its detail view, exactly as `phui owner/repo#123`
would. Issues open the repository's Issues surface; anything phui has no surface
for (releases, discussions) falls back to your browser.

- `d` marks a thread done, `m` marks it read, `shift-u` unsubscribes.
- `shift-a` marks everything read.
- `u` widens the list to threads you have already read; `p` narrows it to
  threads you are participating in.
- `r` refreshes; the surface also polls once a minute while it is visible.

The workspace tab strip carries the unread count, so phui tells you a review was
requested without you opening github.com to find out. Reading notifications
needs a `gh` token with the `notifications` scope — `gh auth login` grants it by
default, and the surface says so plainly if yours does not have it.

### Stars

Press `5` (or `g s`) to browse everything you have starred, with star count,
language, description, and last-push age.

- `/` filters as you type across name, description, language, and topics.
- `s` cycles the sort: recently starred, recently pushed, most stars, name.
- `enter` scopes phui to the repository, so its pull requests, issues, and
  Actions are one keystroke away.
- `o` opens it in a browser, `shift-u` unstars it, `r` refreshes.

phui reads the first 500 stars and tells you when it stopped there.

### Workflow runs

Open a repository and select its **Actions** tab to monitor recent workflow runs
across branches and events. Active runs refresh automatically while the surface
is visible. You can also press `a` on a pull request to open runs scoped to that
PR's head commit.

- The runs list shows each workflow, branch, status, conclusion, duration, and age.
- `enter` drills into a run to see its jobs and steps; failing steps are easy to spot.
- `n` / `p` jump between failures, `o` opens the run in your browser, and `r` refreshes.
- `R` reruns a completed workflow, `F` reruns failed jobs, and `x` cancels an active run.
- `tab` / `shift-tab` move between repository surfaces; `esc` walks back through run detail and repository scope.

Requires the GitHub CLI (`gh`) the same as the rest of phui; nothing extra to configure.

## Keybindings

- `up` / `down`: move selection
- `k` / `j`: move selection
- `gg` / `G`: jump to first or last pull request
- `ctrl-u` / `ctrl-d`: page up or down
- `tab` / `shift-tab`: switch PR queue
- `1`–`6`: jump straight to a workspace surface
- `g h` / `g p` / `g i` / `g n` / `g s`: go to repos, pull requests, issues, inbox, stars
- `ctrl-p` / `cmd-k`: open the command palette
- `/`: filter
- `enter`: expand details; normal PR actions still work while details are expanded
- `esc`: return from expanded details, leave diff/comment mode, or close modal
- `r`: refresh
- `d`: view stacked diff for all changed files
- `a`: view this PR's GitHub Actions runs
- `shift-r`: review or approve the selected pull request
- `up` / `down` / `pageup` / `pagedown`: move comment target while viewing a diff
- `enter`: open a commented diff line, or start a comment on an uncommented line
- `v`: start or clear a multi-line diff comment range
- `n` / `p`: jump between diff comment threads
- `f`: open the changed-files navigator while viewing a diff
- `left` / `right`: choose the deleted or added side while in split diff comment mode
- `[` / `]`: switch files while viewing or commenting on a diff
- `s`: toggle draft or ready-for-review state
- `m`: merge
- `x`: close with confirmation
- `t`: choose a fixed theme, including `System` to match your terminal colors; press `m` in the theme picker to follow the OS light/dark appearance with separate theme choices
- `l`: manage labels
- `o`: open PR in browser
- `e`: open PR in your editor (configurable; see `editorCommand` / `repoPaths`)
- `y`: copy PR metadata
- `q`: quit

Authored-only pull request views render compact one-line rows because the
author identity is implied by the active view. Mixed-author views continue to
show the author and branch metadata row.

Review submission:

- Press `shift-r` to open the review modal.
- Use `j` / `k` or `up` / `down` to choose Comment, Approve, or Request changes.
- Press `enter` to move to the optional summary area.
- Press `enter` again to submit, or `shift-enter` to insert a newline.
- Press `esc` from the summary to return to action selection; press `esc` from action selection to cancel.

## Credits and license

phui is a fork of [**ghui**](https://github.com/kitlangton/ghui), created by
[Kit Langton](https://github.com/kitlangton). Kit wrote the application: the
PR, issue, and diff surfaces, the review flow, the keyboard model, the theming,
and the overall design that makes it worth using at all. Everything below is a
layer on top of that work, and the credit for the tool belongs to him.

What this fork adds:

- A repository **Actions** dashboard, and **Inbox**, **Stars**, and **Projects**
  surfaces (the last a portfolio linter over local repos)
- Handoff into [phux](https://github.com/phall1/phux) — open a PR directly in a
  phux worktree session with `w`, plus agent cockpit handoff
- Packaging for my own setup: standalone binaries, a `phall1/tap` Homebrew
  formula, scoped npm publishing, and automated releases

It exists as a fork rather than as pull requests because most of it is wired to
my own tooling — phux handoff in particular — which is a reasonable thing for
upstream not to carry. Nothing here is a criticism of the original, and if any
of it is useful to Kit, it's his to take.

Licensed MIT, under the original copyright — see [LICENSE](LICENSE).
