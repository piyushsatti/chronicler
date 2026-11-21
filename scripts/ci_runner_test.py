#!/usr/bin/env python3
"""CI jobs run on GitHub-hosted runners."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WORKFLOWS = (
    ".github/workflows/api.yml",
    ".github/workflows/web.yml",
    ".github/workflows/agent.yml",
    ".github/workflows/repo.yml",
)
RUNS_ON = re.compile(r"^    runs-on: (.+)$", re.MULTILINE)


class RunnerSelectionTest(unittest.TestCase):
    def test_ci_jobs_use_hosted_runners(self) -> None:
        for path in WORKFLOWS:
            with self.subTest(workflow=path):
                found = RUNS_ON.findall((REPO / path).read_text())
                assert found == ["ubuntu-latest"], (path, found)
        api = (REPO / ".github/workflows/api.yml").read_text()
        assert api.count("/var/run/docker.sock:/var/run/docker.sock") == 1


if __name__ == "__main__":
    unittest.main()
