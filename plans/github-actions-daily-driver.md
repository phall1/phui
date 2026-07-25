# GitHub Actions daily-driver plan

Build phui into a terminal-first replacement for the routine GitHub Actions web
experience. Reuse the shipped PR runs view and progressively widen it into a
repository-level monitoring and control surface.

## Why

The current PR-scoped view is useful for inspecting jobs and steps, but daily
Actions work also requires watching all active runs, filtering noisy histories,
reading logs, rerunning or cancelling work, dispatching workflows, and handling
artifacts without switching to a browser.

## What

1. **Reliable PR controls**: refresh list and detail, rerun all or failed jobs,
   cancel active runs, status-gated actions, mock support, and action feedback.
2. **Logs**: fetch plain-text run logs lazily, isolate the selected job/step,
   render searchable and scrollable output, preserve ANSI safely, and support
   copy/open-in-editor workflows.
3. **Repository Actions surface**: add an Actions workspace tab with paginated
   runs across branches and events, active/failing presets, workflow/branch/status
   filters, run detail reuse, and optional active-run polling.
4. **Dispatch and workflow controls**: list workflows, collect dispatch inputs
   and refs, run `workflow_dispatch`, enable/disable workflows, and expose recent
   dispatches immediately.
5. **Artifacts and diagnostics**: list/download artifacts, select destinations,
   show expiry/size, surface annotations, and link failures back to source.
6. **Operational polish**: desktop notifications, configurable polling, API-rate
   awareness, cache recent run metadata, keyboard help, and narrow-terminal
   layouts.

## API mapping

- Runs: `gh run list`, `gh run view`, `gh run watch`
- Controls: `gh run rerun`, `gh run cancel`, `gh run delete`
- Logs: `gh run view --log`, `gh run view --log-failed`
- Workflows: `gh workflow list`, `gh workflow view`, `gh workflow run`,
  `gh workflow enable`, `gh workflow disable`
- Artifacts: GitHub REST Actions artifacts endpoints through `gh api`
- Annotations: check-runs REST endpoints through `gh api`

## Open questions

- Poll only visible active runs, or keep a low-frequency repository watcher?
- Should deleting a run be supported, and if so require typed confirmation?
- Store downloaded artifact destinations globally or per repository?
- Parse workflow dispatch inputs from workflow YAML or request metadata through
  the API when available?

## Status

In progress. The PR runs view and controls are shipped. The repository Actions
surface now shows recent runs across branches, reuses job/step drill-down and
controls, and watches active runs while visible. Logs, workflow dispatch,
artifacts, and richer repository filters remain follow-up phases.
