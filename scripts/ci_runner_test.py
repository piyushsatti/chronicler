#!/usr/bin/env python3
"""CI jobs from forks and Dependabot use a GitHub-hosted runner."""

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
FORK = "github.event.pull_request.head.repo.fork"
DEPENDABOT = "github.event.pull_request.user.login == 'dependabot[bot]'"
# fork is None on push, where the pull_request payload is absent.
CASES = (
    ("fork pull request", True, "contributor", "ubuntu-latest"),
    ("same-repo pull request", False, "contributor", "triton"),
    ("push to main", None, None, "triton"),
    ("dependabot pull request", False, "dependabot[bot]", "ubuntu-latest"),
)
Value = bool | str


def job_runs_on(text: str) -> str:
    found = RUNS_ON.findall(text)
    if len(found) != 1:
        raise AssertionError(f"expected one job runs-on, found {found}")
    return found[0]


def select(expression: str, fork: bool | None, login: str | None) -> Value:
    """Evaluate a runs-on expression. && and || return operands, && first."""
    body = expression.removeprefix("${{").removesuffix("}}").strip()
    body = body.replace(FORK, "true" if fork else "false")
    body = body.replace(DEPENDABOT, "true" if login == "dependabot[bot]" else "false")
    return _Parser(_tokens(body)).parse()


def _tokens(expr: str) -> list[str]:
    tokens: list[str] = []
    i = 0
    while i < len(expr):
        if expr[i].isspace():
            i += 1
            continue
        if expr.startswith(("&&", "||"), i):
            tokens.append(expr[i : i + 2])
            i += 2
            continue
        if expr[i] in "()":
            tokens.append(expr[i])
            i += 1
            continue
        if expr[i] == "'":
            end = expr.index("'", i + 1)
            tokens.append(expr[i : end + 1])
            i = end + 1
            continue
        end = i
        while end < len(expr) and not expr[end].isspace() and expr[end] not in "()&|'":
            end += 1
        if end == i:
            raise AssertionError(f"bad token at {expr[i:]!r}")
        tokens.append(expr[i:end])
        i = end
    return tokens


class _Parser:
    def __init__(self, tokens: list[str]) -> None:
        self.tokens = tokens
        self.i = 0

    def parse(self) -> Value:
        value = self._or()
        if self.i != len(self.tokens):
            raise AssertionError(f"trailing {self.tokens[self.i]!r}")
        return value

    def _or(self) -> Value:
        value = self._and()
        while self._peek() == "||":
            self.i += 1
            right = self._and()
            if not value:
                value = right
        return value

    def _and(self) -> Value:
        value = self._primary()
        while self._peek() == "&&":
            self.i += 1
            right = self._primary()
            if value:
                value = right
        return value

    def _primary(self) -> Value:
        token = self._pop()
        if token == "(":
            value = self._or()
            if self._pop() != ")":
                raise AssertionError("unclosed '('")
            return value
        if token == "true":
            return True
        if token == "false":
            return False
        if len(token) >= 2 and token[0] == "'" and token[-1] == "'":
            return token[1:-1]
        raise AssertionError(f"unbound token {token}")

    def _peek(self) -> str | None:
        if self.i >= len(self.tokens):
            return None
        return self.tokens[self.i]

    def _pop(self) -> str:
        token = self._peek()
        if token is None:
            raise AssertionError("truncated expression")
        self.i += 1
        return token


class RunnerSelectionTest(unittest.TestCase):
    def test_fork_and_dependabot_use_hosted_runners(self) -> None:
        expressions = [job_runs_on((REPO / path).read_text()) for path in WORKFLOWS]
        assert len(set(expressions)) == 1, expressions
        for path, expression in zip(WORKFLOWS, expressions, strict=True):
            for name, fork, login, want in CASES:
                with self.subTest(workflow=path, case=name):
                    assert select(expression, fork, login) == want, (path, name)
        api = (REPO / ".github/workflows/api.yml").read_text()
        # One socket mount, on the job whose runs-on is ubuntu-latest for a fork,
        # so the mount is that runner's Docker and not the Triton host socket.
        assert api.count("/var/run/docker.sock:/var/run/docker.sock") == 1


if __name__ == "__main__":
    unittest.main()
