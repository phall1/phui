#!/usr/bin/env python3
"""Boot a compiled phui binary in a PTY and fail if it hangs on the splash.

`--version` cannot catch the Solid bootstrap hangs that shipped in 0.16.0–0.17.2.
This drives the binary with mock data and looks for a workspace tab, not the logo.
"""

from __future__ import annotations

import os
import pty
import select
import signal
import sys
import time

TIMEOUT_S = 8.0
READY_MARKERS = (b"PULL REQUESTS", b"REPOS", b"INBOX", b"PROJECTS")
STUCK_MARKERS = (b"Starting phui",)


def main() -> int:
	if len(sys.argv) != 2:
		print("usage: boot-smoke.py <phui-binary>", file=sys.stderr)
		return 2
	binary = sys.argv[1]
	env = os.environ.copy()
	env["PHUI_MOCK_PR_COUNT"] = env.get("PHUI_MOCK_PR_COUNT") or "8"
	env["PHUI_MOCK_REPO_COUNT"] = env.get("PHUI_MOCK_REPO_COUNT") or "2"
	env["PHUI_FORCE_FULL_REPAINT_ON_START"] = "1"
	pid, fd = pty.fork()
	if pid == 0:
		os.chdir(os.path.dirname(os.path.abspath(binary)) or ".")
		os.execve(binary, [binary], env)
	buf = bytearray()
	deadline = time.monotonic() + TIMEOUT_S
	try:
		while time.monotonic() < deadline:
			ready, _, _ = select.select([fd], [], [], 0.2)
			if ready:
				try:
					chunk = os.read(fd, 4096)
				except OSError:
					break
				if not chunk:
					break
				buf.extend(chunk)
				if any(marker in buf for marker in READY_MARKERS):
					return 0
		sample = bytes(buf[-2500:]).decode("utf-8", "replace")
		stuck = any(marker in buf for marker in STUCK_MARKERS)
		print(f"boot-smoke: binary did not paint a workspace tab within {TIMEOUT_S:.0f}s", file=sys.stderr)
		if stuck:
			print("boot-smoke: still showing Starting phui", file=sys.stderr)
		print(sample, file=sys.stderr)
		return 1
	finally:
		try:
			os.kill(pid, signal.SIGTERM)
		except OSError:
			pass
		try:
			os.close(fd)
		except OSError:
			pass
		try:
			os.waitpid(pid, 0)
		except OSError:
			pass


if __name__ == "__main__":
	raise SystemExit(main())
