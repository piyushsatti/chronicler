#!/usr/bin/env python3
"""Lint living documentation for the ownership model.

Checks:
- In-repo markdown links use repo-root absolute paths (/docs/..., /apps/...)
- Link targets stay under the git root, exist, and have real content
  (directories need a contentful README.md)
- Decision files ≤100 lines
- Interface required sections
- No file:line evidence; no wiki / epic working-file cites
- App docs must not link into /docs/systems/ essays

Exit 0 if clean, 1 if findings.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

LIVING_ROOTS = [
    REPO / "docs",
    REPO / "apps" / "api" / "docs",
    REPO / "apps" / "web" / "docs",
    REPO / "apps" / "discord" / "docs",
    REPO / "apps" / "agent" / "docs",
    REPO / "deploy" / "docs",
]

HUBS = [REPO / "AGENTS.md", REPO / "CONTRIBUTING.md", REPO / "README.md"]

LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
FILE_LINE_RE = re.compile(
    r"(?<![`/])\b[\w./-]+\.(?:py|ts|tsx|yml|yaml|sql|toml|sh):\d+(?:-\d+)?\b"
)
FORBIDDEN = [
    (re.compile(r"chronicler\.wiki|github\.com/.*/wiki", re.I), "wiki URL"),
    (re.compile(r"\bepic-\d+[A-Za-z0-9_-]*\.md\b"), "epic working file"),
]
CONTRIBUTING_SKIP = {"wiki URL", "epic working file"}

INTERFACE_REQUIRED = ["## Rule", "## Enforcement", "## Provider", "## Consumers"]
SYSTEM_ESSAY_LINK = re.compile(r"/docs/systems/[a-z0-9-]+\.md")
PLACEHOLDER_DOC = re.compile(r"^#\s*Placeholder\s*$", re.I | re.M)

# Beyond a title: need this much non-heading body (chars).
MIN_BODY_CHARS = 40


def iter_md() -> list[Path]:
    out: list[Path] = []
    for root in LIVING_ROOTS:
        if not root.exists():
            continue
        out.extend(root.rglob("*.md"))
    for h in HUBS:
        if h.exists():
            out.append(h)
    return out


def link_path(raw: str) -> str | None:
    """Return the path portion of a link target, or None to skip."""
    s = raw.strip()
    if s.startswith("<") and ">" in s:
        s = s[1 : s.index(">")]
    else:
        s = s.split()[0] if s.split() else s
    if s.startswith(("http://", "https://", "mailto:", "#")):
        return None
    if "://" in s:
        return None
    return s.split("#", 1)[0]


def resolve_repo_link(target_path: str) -> Path | None:
    if not target_path.startswith("/"):
        return None
    return (REPO / target_path.lstrip("/")).resolve()


def resolve_doc_link(source: Path, target_path: str) -> Path | None:
    """Resolve in-repo link target from a living doc (absolute or relative)."""
    if target_path.startswith("/"):
        return resolve_repo_link(target_path)
    return (source.parent / target_path).resolve()


def audits_allow_relative(rel: Path) -> bool:
    return str(rel).startswith("docs/audits/")


def has_content(path: Path) -> bool:
    """True if the path is a non-empty doc (or a dir with a contentful README)."""
    if path.is_dir():
        readme = path / "README.md"
        return readme.is_file() and has_content(readme)
    if not path.is_file():
        return False
    if path.suffix.lower() != ".md":
        return path.stat().st_size > 0
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        return False
    if PLACEHOLDER_DOC.search(text) and len(text.strip()) < MIN_BODY_CHARS + 20:
        return False
    body = re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.S)
    body = re.sub(r"^#+\s+.*$", "", body, flags=re.M)
    body = body.strip()
    return len(body) >= MIN_BODY_CHARS


def check_decision_size(findings: list[str]) -> None:
    for base in [
        REPO / "docs" / "decisions",
        REPO / "apps" / "api" / "docs" / "decisions",
        REPO / "apps" / "web" / "docs" / "decisions",
    ]:
        if not base.exists():
            continue
        for p in base.glob("D*.md"):
            n = len(p.read_text(encoding="utf-8").splitlines())
            if n > 100:
                findings.append(
                    f"{p.relative_to(REPO)}: decision has {n} lines (cap 100)"
                )


def check_interfaces(findings: list[str]) -> None:
    root = REPO / "docs" / "interfaces"
    if not root.exists():
        findings.append("docs/interfaces/ missing")
        return
    for p in root.glob("*.md"):
        if p.name == "README.md":
            continue
        text = p.read_text(encoding="utf-8")
        for sec in INTERFACE_REQUIRED:
            if sec not in text:
                findings.append(f"{p.relative_to(REPO)}: missing section {sec}")


def check_links_and_patterns(findings: list[str]) -> None:
    repo_resolved = REPO.resolve()
    content_cache: dict[Path, bool] = {}

    def content_ok(p: Path) -> bool:
        if p not in content_cache:
            content_cache[p] = has_content(p)
        return content_cache[p]

    for path in iter_md():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO)
        if str(rel).startswith("docs/templates"):
            continue

        for rx, label in FORBIDDEN:
            if rx.search(text):
                if path.name == "CONTRIBUTING.md" and label in CONTRIBUTING_SKIP:
                    continue
                findings.append(f"{rel}: forbidden pattern ({label})")

        hits = [h for h in FILE_LINE_RE.findall(text) if not h.startswith("file:")]
        if hits:
            findings.append(
                f"{rel}: file:line evidence ({len(hits)} hits, e.g. {hits[0]})"
            )

        for m in LINK_RE.finditer(text):
            raw = m.group(2)
            file_part = link_path(raw)
            if file_part is None:
                continue
            if file_part == "":
                continue
            if not file_part.startswith("/"):
                if not audits_allow_relative(rel):
                    abs_hint = file_part.lstrip("./")
                    findings.append(
                        f"{rel}: use repo-root absolute link (/{abs_hint}) "
                        f"not relative ({raw.strip().split()[0]})"
                    )
                    continue
                resolved = resolve_doc_link(path, file_part)
            else:
                resolved = resolve_repo_link(file_part)
            if resolved is None:
                continue
            try:
                resolved.relative_to(repo_resolved)
            except ValueError:
                findings.append(f"{rel}: link escapes git root → {file_part}")
                continue
            if not resolved.exists():
                findings.append(
                    f"{rel}: broken link (missing under git root) → {file_part}"
                )
                continue
            if not content_ok(resolved):
                kind = (
                    "directory without README.md"
                    if resolved.is_dir()
                    else "empty or placeholder"
                )
                findings.append(f"{rel}: link target {kind} → {file_part}")

        if str(rel).startswith("apps/") and "/docs/" in str(rel):
            for m in LINK_RE.finditer(text):
                t = m.group(2)
                if SYSTEM_ESSAY_LINK.search(t):
                    findings.append(
                        f"{rel}: app doc links to system essay ({t}) — "
                        "link interfaces only"
                    )


def main() -> int:
    findings: list[str] = []
    check_decision_size(findings)
    check_interfaces(findings)
    check_links_and_patterns(findings)
    findings = sorted(set(findings))
    if findings:
        print(f"docs-lint: {len(findings)} finding(s)")
        for f in findings[:200]:
            print(f"  {f}")
        if len(findings) > 200:
            print(f"  ... and {len(findings) - 200} more")
        return 1
    print("docs-lint: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
