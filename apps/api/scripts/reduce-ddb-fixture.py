#!/usr/bin/env python3
"""Reduce a dated public DDB capture without retaining unused provider data."""

import argparse
import hashlib
import json
from pathlib import Path


CAPTURE_FIELDS = (
    "url", "public_page", "catalog", "capture_utc", "status", "bytes", "sha256",
    "content_type", "authenticated", "source", "verification_boundary",
)
MODIFIER_GROUPS = ("background", "class", "condition", "feat", "item", "race")
EXCLUDED = [
    "account/user identifiers",
    "character name",
    "licensed feature/background descriptions",
    "inventory/currencies/campaign/notes/avatar URLs",
    "unused rules/effective-stat derivation inputs",
]


def json_object(value, field):
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    return value


def fields(value, names):
    result = {}
    for name in names:
        if name in value:
            if isinstance(value[name], (dict, list)):
                raise ValueError("projected field must be a JSON scalar")
            result[name] = value[name]
    return result


def project(payload):
    envelope = json_object(payload, "capture")
    data = json_object(envelope["data"], "data")
    race = json_object(data["race"], "race")
    background = json_object(data["background"], "background")
    definition = background["definition"]
    if definition is not None:
        definition = fields(json_object(definition, "background definition"), ("name",))
    reduced_background = {"definition": definition}
    if not definition or not definition.get("name"):
        if "customBackground" in background:
            custom = background["customBackground"]
            reduced_background["customBackground"] = (
                None if custom is None else fields(
                    json_object(custom, "custom background"), ("name",)
                )
            )
    classes = data["classes"]
    if not isinstance(classes, list):
        raise ValueError("classes must be an array")
    reduced_classes = []
    for entry in classes:
        entry = json_object(entry, "class")
        reduced_classes.append({
            "level": fields(entry, ("level",))["level"],
            "definition": fields(json_object(entry["definition"], "class definition"), ("name",)),
        })
    modifiers = json_object(data["modifiers"], "modifiers")
    reduced_modifiers = {}
    for group in MODIFIER_GROUPS:
        if group not in modifiers:
            continue
        rows = modifiers[group]
        if not isinstance(rows, list):
            raise ValueError("modifier group must be an array")
        reduced_rows = []
        for row in rows:
            row = json_object(row, "modifier")
            if row.get("type") in ("proficiency", "language"):
                reduced_rows.append(fields(row, ("type", "subType", "friendlySubtypeName", "isGranted")))
        reduced_modifiers[group] = reduced_rows
    reduced_data = {
        "id": fields(data, ("id",))["id"],
        "currentXp": fields(data, ("currentXp",))["currentXp"],
        "race": fields(race, ("fullName", "baseName")),
        "classes": reduced_classes,
        "background": reduced_background,
        **fields(data, ("overrideHitPoints", "armorClass")),
        "modifiers": reduced_modifiers,
    }
    return {"success": fields(envelope, ("success",))["success"], "data": reduced_data}


def reject_constant(_):
    raise ValueError("non-finite JSON number")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON member")
        result[key] = value
    return result


def read_json(raw):
    return json.loads(raw, parse_constant=reject_constant, object_pairs_hook=unique_object)


def reduce_capture(source, provenance, out):
    raw = source.read_bytes()
    supplied = json_object(read_json(provenance.read_bytes()), "provenance")
    capture = {name: fields(supplied, (name,))[name] for name in CAPTURE_FIELDS}
    source_hash = hashlib.sha256(raw).hexdigest()
    if capture["sha256"] != source_hash:
        raise ValueError("source SHA256 does not match provenance")
    if type(capture["bytes"]) is not int or capture["bytes"] != len(raw):
        raise ValueError("source byte count does not match provenance")
    if capture["authenticated"] is not False or type(capture["status"]) is not int or capture["status"] != 200:
        raise ValueError("provenance must describe an anonymous HTTP 200 capture")
    reduced = project(read_json(raw))
    reduced_bytes = (json.dumps(reduced, indent=2, sort_keys=True, allow_nan=False) + "\n").encode()
    optional_states = []
    for name in ("armorClass", "overrideHitPoints"):
        if name not in reduced["data"]:
            optional_states.append(f"{name} absent")
        elif reduced["data"][name] is None:
            optional_states.append(f"{name} null")
    report = {
        "capture": capture,
        "reduction": {
            "algorithm": "deterministic allowlist projection v1",
            "source_sha256": source_hash,
            "reduced_sha256": hashlib.sha256(reduced_bytes).hexdigest(),
            "reduced_bytes": len(reduced_bytes),
            "excluded": EXCLUDED,
            "preserved_missing_optional": optional_states,
            "validation_boundary": "one dated public provider response transformed offline; not synthetic-original, ongoing parity or completeness of all DDB rule calculations",
        },
    }
    report_bytes = (json.dumps(report, indent=2, allow_nan=False) + "\n").encode()
    out.mkdir(parents=True, exist_ok=True)
    (out / "published-premade.reduced.json").write_bytes(reduced_bytes)
    (out / "published-premade.provenance.json").write_bytes(report_bytes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        reduce_capture(args.source, args.provenance, args.out)
    except (OSError, ValueError, KeyError, TypeError, RecursionError):
        parser.exit(1, "capture reduction failed; check input shape and provenance\n")


if __name__ == "__main__":
    main()
