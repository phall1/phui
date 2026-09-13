// App-side modules select GitHub mock vs live runtime at import time. Set the
// mock fixture env before any test file can import `src/`, so file order cannot
// freeze a live runtime and then fail the TUI suites.
process.env.PHUI_MOCK_PR_COUNT ??= "80"
process.env.PHUI_MOCK_REPO_COUNT ??= "4"
process.env.PHUI_MOCK_FIXTURE_PATH ??= "/var/folders/dd/5fz89drs5p9_r0fk7rwqqnbr0000gn/T/opencode/phui-test-no-fixture.json"
process.env.PHUI_MOCK_WORKSPACE_PREFERENCES_PATH ??= "off"
process.env.PHUI_PR_PAGE_SIZE ??= "100"
