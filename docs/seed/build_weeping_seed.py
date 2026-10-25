#!/usr/bin/env python3
"""Build the Weeping day-zero seed for cmd/seedqa from the extracted archive.

Usage (run with -I so nothing is imported from the archive folder):

    python3 -I docs/seed/build_weeping_seed.py <extracted-Weeping-dir> \
        [--author-public-id <member public_id>] \
        --out apps/api/db/seed/weeping.jsonl \
        [--hexmap-out apps/api/db/seed/weeping-hexmap.jsonl]

By default every author / creator ref is {"platform_owner": true}: seedqa resolves
it at load time from PLATFORM_OWNER_DISCORD_ID, so no member id is written here.
--author-public-id pins a specific member instead (for example a dev fixture).

The archive is data, never code: this script only reads Markdown text.
Every row gets a deterministic UUIDv5 public_id, so rebuilding gives the same
ids and re-loading with seedqa is a no-op (ON CONFLICT DO NOTHING).
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
import uuid
from pathlib import Path

NAMESPACE = uuid.UUID("5d3f6f2e-7a43-5c1e-9a5e-77656570696e")  # fixed: "weeping" seed namespace
PUBLISHED_AT = "2026-10-25T00:00:00Z"
CREATED_AT = "2026-10-25T00:00:00Z"

# Archive frontmatter category -> documents.category (product_validation.go allow-list).
CODEX_CATEGORY = {"npc": "NPC", "faction": "Faction", "artifact": "Artifact", "lore": "Lore"}

# Frontmatter titles with obvious casing slips; the file name is the intended title.
TITLE_FIX = {
    "katsík I": "Katsík I",
    "High council": "High Council",
    "Prism of light": "Prism of Light",
    "The crimson halo": "The Crimson Halo",
}

# Codex/Untitled.md is a Chronicler UI brief, not lore. It is never seeded.
SKIP = {"Codex/Untitled.md"}

# Empty Markdown links in the guides, rewritten to the in-app reader route.
# Keyed by (file, link text). Anything not listed stays as written.
LINK_FIX = {
    ("Guides/Gameplay Guide.md", "PCXP"): "/rules/guides/pcxp",
    ("Guides/Gameplay Guide.md", "Bots Guide"): "/rules/guides/bots-guide",
    ("Guides/DMG.md", "DM Mechanics"): "/rules/guides/dm-mechanics",
    ("Guides/New Player Guide.md", "Check it out here."): "/rules/guides/welcome-to-d-d",
    ("Guides/New Player Guide.md", "here"): "/rules/guides/character-creation",
    ("Guides/New Player Guide.md", "gameplay guide"): "/rules/guides/gameplay-guide",
    ("Guides/Downtime System (Quick Projects).md", "Magic Items"): "/rules/guides/magic-items",
    ("Guides/DM Mechanics.md", "Maps"): "/map",
    ("Guides/DM Mechanics.md", "Magic Items"): "/rules/guides/magic-items",
}

# Owner naming rulings (2026-10-25): the ruler is the Lightkeeper; where the text means
# the order rather than the place, Frostmarch and Sol Invictus become "Order of <name>".
# Exact (file, old, new) replacements; each old string must occur exactly once.
NAME_FIX = [
    ("Codex/Katsik I.md", "Katsík the first lightbearer", "Katsík the first Lightkeeper"),
    ("Codex/Laws of the Light.md", "pay taxes to the lightbearer.", "pay taxes to the Lightkeeper."),
    ("Codex/Laws of the Light.md", "appointed by the Lightbearer.", "appointed by the Lightkeeper."),
    ("Codex/Leander IV.md", "**The Frostmarch.** Leander founded the Frostmarch to guard",
     "**The Order of Frostmarch.** Leander founded the Order of Frostmarch to guard"),
    ("Codex/Leander IV.md", "**Sol Invictus**. Leander founded Sol Invictus to spread",
     "**The Order of Sol Invictus**. Leander founded the Order of Sol Invictus to spread"),
    ("Codex/Lightfall.md", "the Frostmarch, and Sol Invictus are the Lightkeeper's reach",
     "the Order of Frostmarch, and the Order of Sol Invictus are the Lightkeeper's reach"),
    ("Codex/Backgrounds.md", "before you joined Sol Invictus", "before you joined the Order of Sol Invictus"),
    ("Codex/Backgrounds.md", "the Emberwatch and the Frostmarch watch", "the Emberwatch and the Order of Frostmarch watch"),
    ("Codex/Classes.md", "silent hands of the Frostmarch.", "silent hands of the Order of Frostmarch."),
]


def read_fixed(root: Path, rel: str) -> str:
    text = (root / rel).read_text("utf-8")
    for file, old, new in NAME_FIX:
        if file == rel:
            if text.count(old) != 1:
                raise SystemExit(f"NAME_FIX: {old!r} occurs {text.count(old)} times in {rel}")
            text = text.replace(old, new)
    return text


FRONTMATTER = re.compile(r"\A---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)


def pid(*parts: str) -> str:
    return str(uuid.uuid5(NAMESPACE, ":".join(parts)))


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def split_frontmatter(raw: str) -> tuple[dict[str, str], str, str]:
    """Return (fields, yaml_block, body). Fields are flat `key: value` lines."""
    match = FRONTMATTER.match(raw)
    if not match:
        return {}, "", raw
    block = match.group(1)
    fields = {}
    for line in block.splitlines():
        key, sep, value = line.partition(":")
        if sep and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key.strip()):
            fields[key.strip()] = value.strip()
    return fields, block, raw[match.end():]


def yaml_block(fields: dict[str, str], drop: set[str]) -> str | None:
    """Re-emit kept, non-empty fields as YAML with every value JSON-quoted (valid YAML)."""
    lines = [f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in fields.items() if v and k not in drop]
    return "\n".join(lines) + "\n" if lines else None


def fix_links(rel: str, body: str) -> tuple[str, list[str]]:
    left = []

    def repl(m: re.Match[str]) -> str:
        target = LINK_FIX.get((rel, m.group(1)))
        if target is None:
            left.append(m.group(1))
            return m.group(0)
        return f"[{m.group(1)}]({target})"

    return re.sub(r"(?<!!)\[([^\]]+)\]\(\)", repl, body), left


class Seed:
    def __init__(self, author: dict) -> None:
        self.author = author
        self.lines: list[dict] = []
        self.slugs: dict[str, str] = {}
        self.report: dict[str, list] = {"unfixed_empty_links": [], "documents": []}

    def put(self, table: str, conflict: list[str], row: dict, refs: dict | None = None) -> None:
        line = {"table": table, "conflict": conflict}
        if refs:
            line["refs"] = refs
        line["row"] = row
        self.lines.append(line)

    def doc(self, kind: str, category: str, title: str, slug: str, body: str, fm: str | None, source: str) -> str:
        if slug in self.slugs:
            raise SystemExit(f"duplicate slug {slug}: {source} and {self.slugs[slug]}")
        self.slugs[slug] = source
        public_id = pid("documents", slug)
        row = {
            "public_id": public_id, "kind": kind, "category": category, "slug": slug, "title": title,
            "body": body.strip() + "\n", "status": "published", "visibility": "public",
            "published_at": PUBLISHED_AT, "version": 0,
        }
        if fm:
            row["frontmatter_yaml"] = fm
        if len(row["body"].encode()) > 128 * 1024:
            raise SystemExit(f"{source}: body exceeds 128 KiB")
        # documents.slug is unique too; conflicting on slug makes a clash skip, not abort.
        self.put("documents", ["slug"], row, {"author_id": self.author})
        self.report["documents"].append({"kind": kind, "category": category, "slug": slug, "title": title, "source": source})
        return public_id


def sections(body: str, level: int) -> list[tuple[str, str]]:
    marker = "#" * level + " "
    out: list[tuple[str, str]] = []
    for chunk in re.split(rf"(?m)^(?={re.escape(marker)})", body):
        if not chunk.startswith(marker):
            continue
        head, _, rest = chunk.partition("\n")
        # Cut at the next heading of a higher (shallower) level.
        rest = re.split(rf"(?m)^#{{1,{level - 1}}} ", rest)[0] if level > 1 else rest
        out.append((head[len(marker):].strip(), rest.strip()))
    return out


def first_paragraph(text: str) -> str:
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if para and not para.startswith(("|", "#", "*Today")):
            return para
    return ""


def catalog(seed: Seed, root: Path, region_id: str) -> None:
    refs = {"introduced_by_region_id": {"table": "regions", "public_id": region_id}}

    _, _, body = split_frontmatter(read_fixed(root, "Codex/Species in Weeping.md"))
    for head, text in sections(body, 2):
        m = re.fullmatch(r"(.+?)\s*\((.+)\)", head)
        name, alt = (m.group(1), m.group(2)) if m else (head, None)
        today = re.search(r"\*Today in Lightfall:\s*(.+?)\*", text, re.S)
        payload = {"source": "Codex/Species in Weeping.md", "edition": "weeping"}
        if alt:
            payload["also_called"] = alt
        if today:
            payload["today_in_lightfall"] = today.group(1).strip()
        seed.put("creation_catalog", ["kind", "code"], {
            "public_id": pid("creation_catalog", "species", slugify(name)), "kind": "species",
            "code": "weeping_" + slugify(name).replace("-", "_"), "name": name,
            "description": first_paragraph(text), "available": True, "retired": False, "payload": payload,
        }, refs)

    _, _, body = split_frontmatter(read_fixed(root, "Codex/Classes.md"))
    for head, text in sections(body, 2):
        subclasses = []
        for row in text.splitlines():
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            if len(cells) == 2 and cells[0] and cells[0] != "Subclass" and not set(cells[0]) <= set("-: "):
                subclasses.append({"name": cells[0], "touchpoint": cells[1]})
        seed.put("creation_catalog", ["kind", "code"], {
            "public_id": pid("creation_catalog", "class", slugify(head)), "kind": "class",
            "code": "weeping_" + slugify(head).replace("-", "_"), "name": head,
            "description": None, "available": True, "retired": False,
            "payload": {"source": "Codex/Classes.md", "edition": "weeping", "subclasses": subclasses},
        }, refs)

    _, _, body = split_frontmatter(read_fixed(root, "Codex/Backgrounds.md"))
    for head, text in sections(body, 2):
        variants = []
        for vhead, vtext in sections("\n" + text, 3):
            if not vhead:
                continue  # empty "### " placeholders in the source
            tags = re.match(r"\*([^*]+)\*", vtext)
            variants.append({
                "name": vhead,
                "tags": [t.strip() for t in tags.group(1).split(" - ")] if tags else [],
                "blurb": first_paragraph(vtext[tags.end():] if tags else vtext),
            })
        payload = {"source": "Codex/Backgrounds.md", "edition": "weeping", "variants": variants}
        # "[Details to be unlocked after ...]" marks a background that is not open yet (Sailor).
        locked = re.search(r"\[(Details to be unlocked[^\]]*)\]", text)
        if locked:
            payload["locked_note"] = locked.group(1)
        seed.put("creation_catalog", ["kind", "code"], {
            "public_id": pid("creation_catalog", "background", slugify(head)), "kind": "background",
            "code": "weeping_" + slugify(head).replace("-", "_"), "name": head,
            "description": "Variants: " + ", ".join(v["name"] for v in variants) if variants else None,
            "available": not locked, "retired": False, "payload": payload,
        }, refs)


def lightfall_locations(seed: Seed, root: Path) -> None:
    """Notable Locations bullets in Codex/Lightfall.md become short Locations entries, text verbatim."""
    _, _, body = split_frontmatter(read_fixed(root, "Codex/Lightfall.md"))
    block = body.split("### Notable Locations", 1)[1].split("\n#", 1)[0]
    for m in re.finditer(r"(?m)^- ([^:\n]+):\s*(.+)$", block):
        name, text = m.group(1).strip(), m.group(2).strip()
        fm = yaml_block({"region": "Lightfall", "source": "Codex/Lightfall.md#notable-locations"}, set())
        seed.doc("codex_entry", "Locations", name, slugify(name), text, fm, "Codex/Lightfall.md (Notable Locations)")


def hexmap(author: dict, root: Path, region_id: str) -> list[dict]:
    """Lightfall hex map as a pointcrawl: centre LFC1001, ring r hex k clockwise from north.

    Source of the convention: Guides/DM Mechanics.md ("Hex Numbering Convention").
    Hex codes come from the tile list in Codex/Untitled.md. Only codes with a tile are seeded.
    """
    codes = sorted(set(re.findall(r"\bLF[CR]\d{4}\b", (root / "Codex/Untitled.md").read_text("utf-8"))))
    size = 60.0
    # Flat-top axial grid (y grows downward): axial (0, -ring) is due north of the centre.
    def ring_hexes(r: int) -> list[tuple[int, int]]:
        # Start due north and walk clockwise: SE, S, SW, NW, N, NE edges.
        q, s = 0, -r
        out = []
        walk = [(1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)]
        for dq, dr in walk:
            for _ in range(r):
                out.append((q, s))
                q, s = q + dq, s + dr
        return out

    def pixel(q: int, r: int) -> tuple[float, float]:
        # Flat-top layout: column q, so axial (0, -ring) sits straight above the centre.
        x = size * 1.5 * q
        y = size * math.sqrt(3) * (r + q / 2)
        return round(x, 2), round(y, 2)

    axial: dict[str, tuple[int, int]] = {}
    for code in codes:
        if code == "LFC1001":
            axial[code] = (0, 0)
            continue
        ring, idx = int(code[3]), int(code[4:])
        hexes = ring_hexes(ring)
        if not 1 <= idx <= len(hexes):
            raise SystemExit(f"{code}: hex index outside ring {ring} ({len(hexes)} hexes)")
        axial[code] = hexes[idx - 1]

    map_id = pid("maps", "lightfall-hex")
    out = [{
        "table": "maps", "conflict": ["atlas_code"],
        "refs": {"region_id": {"table": "regions", "public_id": region_id}, "created_by": author},
        "row": {"public_id": map_id, "name": "Lightfall Hexflower", "atlas_code": "WEEPING-LF",
                "map_kind": "pointcrawl", "family": "campaign", "asset_path": None},
    }]
    node_id = {}
    for code in codes:
        x, y = pixel(*axial[code])
        node_id[code] = pid("pointcrawl_nodes", code)
        out.append({
            "table": "pointcrawl_nodes", "conflict": ["public_id"],
            "refs": {"map_id": {"table": "maps", "public_id": map_id}},
            "row": {"public_id": node_id[code], "name": code, "x": x, "y": y, "created_at": CREATED_AT},
        })
    by_axial = {v: k for k, v in axial.items()}
    for code in codes:
        q, r = axial[code]
        for dq, dr in [(1, 0), (0, 1), (-1, 1)]:  # half the directions: each edge once
            other = by_axial.get((q + dq, r + dr))
            if other is None:
                continue
            out.append({
                "table": "pointcrawl_edges", "conflict": ["public_id"],
                "refs": {"map_id": {"table": "maps", "public_id": map_id},
                         "node_a": {"table": "pointcrawl_nodes", "public_id": node_id[code]},
                         "node_b": {"table": "pointcrawl_nodes", "public_id": node_id[other]}},
                "row": {"public_id": pid("pointcrawl_edges", code, other), "directed": False, "kind": "hex", "label": None},
            })
    return out


def build(root: Path, author: dict) -> Seed:
    seed = Seed(author)
    region_doc = None
    for path in sorted(root.glob("Codex/*.md")):
        rel = path.relative_to(root).as_posix()
        if rel in SKIP:
            continue
        fields, _, body = split_frontmatter(read_fixed(root, rel))
        title = TITLE_FIX.get(fields.get("title", ""), fields.get("title") or path.stem)
        category = CODEX_CATEGORY[fields["category"]]
        fm = yaml_block(fields, {"title", "category", "locked"})
        doc_id = seed.doc("codex_entry", category, title, slugify(title), body, fm, rel)
        if rel == "Codex/Lightfall.md":
            region_doc = doc_id
    lightfall_locations(seed, root)

    for path in sorted(root.glob("Guides/*.md")):
        rel = path.relative_to(root).as_posix()
        fields, _, body = split_frontmatter(path.read_text("utf-8"))
        title = "Character Conflict" if rel == "Guides/Character Conflict.md" else fields["title"]
        body, left = fix_links(rel, body)
        seed.report["unfixed_empty_links"] += [f"{rel}: [{t}]()" for t in left]
        fm = yaml_block({**fields, "summary": fields.get("description", "")}, {"title", "slug", "cluster", "description"})
        seed.doc("rule", fields["cluster"], title, fields["slug"], body, fm, rel)

    for path in sorted(root.glob("Rulings/*.md")):
        rel = path.relative_to(root).as_posix()
        fields, _, body = split_frontmatter(path.read_text("utf-8"))
        fm = yaml_block(fields, {"topic"})
        seed.doc("rule", "ruling", fields["topic"], slugify(fields["topic"]), body, fm, rel)

    region_id = pid("regions", "lightfall")
    seed.put("regions", ["public_id"], {"public_id": region_id, "name": "Lightfall", "kind": "server"},
             {"document_id": {"table": "documents", "public_id": region_doc}})
    catalog(seed, root, region_id)
    seed.region_id = region_id  # type: ignore[attr-defined]
    return seed


def write_jsonl(path: Path, lines: list[dict], header: str) -> None:
    with path.open("w", encoding="utf-8") as fh:
        fh.write(f"# {header}\n")
        for line in lines:
            fh.write(json.dumps(line, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archive_dir", type=Path)
    ap.add_argument("--author-public-id", help="pin members.public_id as author (default: platform owner, resolved at load time)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--hexmap-out", type=Path)
    ap.add_argument("--report", type=Path, help="write a JSON build report here")
    args = ap.parse_args()
    author: dict = {"table": "members", "platform_owner": True}
    if args.author_public_id:
        author = {"table": "members", "public_id": str(uuid.UUID(args.author_public_id))}

    seed = build(args.archive_dir, author)
    write_jsonl(args.out, seed.lines, "generated by: python3 -I docs/seed/build_weeping_seed.py (Weeping day-zero world)")
    if args.hexmap_out:
        rows = hexmap(author, args.archive_dir, seed.region_id)  # type: ignore[attr-defined]
        write_jsonl(args.hexmap_out, rows, "generated by: python3 -I docs/seed/build_weeping_seed.py (Lightfall hex pointcrawl; load after weeping.jsonl)")
    if args.report:
        args.report.write_text(json.dumps(seed.report, indent=2, ensure_ascii=False) + "\n", "utf-8")
    counts: dict[str, int] = {}
    for line in seed.lines:
        counts[line["table"]] = counts.get(line["table"], 0) + 1
    print(json.dumps(counts))
    return 0


if __name__ == "__main__":
    sys.exit(main())
