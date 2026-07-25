---
"phui": major
---

Rename the fork from `ghui` to `phui`.

The binary, the npm package name, the `GHUI_*` environment variables (now
`PHUI_*`), the config and cache directories, and the `@ghui/keymap` workspace
package all change name. Settings written before the rename are still read from
the old config directory when the new one is empty, so upgrading does not reset
preferences; the first settings change writes to the new location.

The SQLite cache moves to a new directory and re-warms on first run. Cache table
names are deliberately unchanged so that pointing `PHUI_CACHE_PATH` at a
pre-rename database still resolves its migration history.
