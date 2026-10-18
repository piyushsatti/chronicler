import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = Path(__file__).with_name("reduce-ddb-fixture.py")
CAPTURE = REPO / ".local/plans/graphql-implementation/provider-captures/ddb-2026-10-14"
FROZEN = REPO / ".local/plans/graphql-implementation/phase1/ddb-fixture"
SOURCE_SHA256 = "89d676ce7b8163dd23dc54da2a1796154296a78d23c7c0692450876a5f404b28"
REDUCED_SHA256 = "02284379bfbcc9caedaeb325323686d5526d70e07520848ffddb400007b2be28"
PROVENANCE_SHA256 = "de624ceaa12ffbc73e1144e9f9386af96999cc6e6e806c2ef47c0d367e63d4ca"


class ReduceDdbFixtureTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="chronicler-c10-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.raw = (CAPTURE / "raw.json").read_bytes()
        self.provenance = json.loads((CAPTURE / "provenance.json").read_bytes())

    def invoke(
        self,
        raw: bytes | None = None,
        provenance: dict[str, object] | None = None,
        out: Path | None = None,
    ) -> tuple[subprocess.CompletedProcess[str], Path]:
        raw = self.raw if raw is None else raw
        provenance = self.provenance if provenance is None else provenance
        source = self.root / "source.json"
        source.write_bytes(raw)
        metadata = self.root / "source-provenance.json"
        metadata.write_text(json.dumps(provenance))
        out = self.root / "output" if out is None else out
        completed = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--source",
                str(source),
                "--provenance",
                str(metadata),
                "--out",
                str(out),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return completed, out

    def synthetic(
        self, payload: object
    ) -> tuple[subprocess.CompletedProcess[str], Path]:
        raw = json.dumps(payload).encode()
        provenance = copy.deepcopy(self.provenance)
        provenance.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        return self.invoke(raw, provenance)

    def read_output(self, out: Path) -> dict[str, object]:
        return json.loads((out / "published-premade.reduced.json").read_bytes())

    def test_dated_capture_exact_frozen_bytes_and_provenance(self) -> None:
        assert hashlib.sha256(self.raw).hexdigest() == SOURCE_SHA256
        assert len(self.raw) == 204710
        completed, out = self.invoke()
        assert completed.returncode == 0, completed.stderr
        assert completed.stdout == ""
        assert completed.stderr == ""
        for name in (
            "published-premade.reduced.json",
            "published-premade.provenance.json",
        ):
            assert (out / name).read_bytes() == (FROZEN / name).read_bytes()
        reduced = (out / "published-premade.reduced.json").read_bytes()
        assert hashlib.sha256(reduced).hexdigest() == REDUCED_SHA256
        provenance_bytes = (out / "published-premade.provenance.json").read_bytes()
        assert hashlib.sha256(provenance_bytes).hexdigest() == PROVENANCE_SHA256
        provenance = json.loads(provenance_bytes)
        assert (
            provenance["capture"]["capture_utc"] == "2026-10-14T13:00:39.738329+00:00"
        )
        assert provenance["reduction"]["source_sha256"] == SOURCE_SHA256
        assert provenance["reduction"]["reduced_sha256"] == REDUCED_SHA256
        assert provenance["reduction"]["reduced_bytes"] == len(reduced)
        data = json.loads(reduced)["data"]
        assert "armorClass" not in data
        assert data["overrideHitPoints"] is None
        assert data["classes"] == [{"level": 1, "definition": {"name": "Barbarian"}}]
        assert data["race"] == {"baseName": "Goliath", "fullName": "Goliath"}
        assert data["background"] == {"definition": {"name": "Soldier"}}
        assert data["currentXp"] == 0
        selected = {
            (row["type"], row["friendlySubtypeName"])
            for rows in data["modifiers"].values()
            for row in rows
            if row["isGranted"] is True
        }
        assert selected == {
            ("language", "Common"),
            ("proficiency", "Constitution Saving Throws"),
            ("proficiency", "Light Armor"),
            ("proficiency", "Martial Weapons"),
            ("proficiency", "Medium Armor"),
            ("proficiency", "Shields"),
            ("proficiency", "Simple Weapons"),
            ("proficiency", "Strength Saving Throws"),
        }
        assert any(
            row["isGranted"] is False
            for rows in data["modifiers"].values()
            for row in rows
        )

    def test_repeat_and_distinct_output_directories_are_deterministic(self) -> None:
        first, out = self.invoke()
        assert first.returncode == 0, first.stderr
        before = {p.name: p.read_bytes() for p in out.iterdir()}
        repeated, _ = self.invoke()
        other, other_out = self.invoke(out=self.root / "other")
        assert repeated.returncode == 0, repeated.stderr
        assert other.returncode == 0, other.stderr
        assert before == {p.name: p.read_bytes() for p in out.iterdir()}
        assert before == {p.name: p.read_bytes() for p in other_out.iterdir()}

    def test_unused_sensitive_fields_are_excluded_at_every_depth(self) -> None:
        payload = json.loads(self.raw)
        marker = "PRIVATE_UNUSED_SENTINEL"
        payload["account"] = marker
        data = payload["data"]
        for field in (
            "name",
            "userId",
            "inventory",
            "currencies",
            "notes",
            "campaign",
            "avatarUrl",
            "baseHitPoints",
        ):
            data[field] = marker
        data["race"]["description"] = marker
        data["background"]["definition"]["description"] = marker
        data["classes"][0]["definition"]["description"] = marker
        data["modifiers"]["class"][0]["account"] = marker
        data["modifiers"]["class"][0]["description"] = {"private": marker}
        data["modifiers"]["class"].append(
            {"type": "bonus", "friendlySubtypeName": marker}
        )
        completed, out = self.synthetic(payload)
        assert completed.returncode == 0, completed.stderr
        output = (out / "published-premade.reduced.json").read_bytes()
        assert marker.encode() not in output
        assert hashlib.sha256(output).hexdigest() == REDUCED_SHA256
        assert marker not in completed.stdout + completed.stderr

    def test_unknown_modifier_groups_ignore_private_names_and_all_shapes(self) -> None:
        marker = "PRIVATE_UNUSED_MODIFIER_GROUP"
        for value in ([], {}, "unused", 7, None, {"description": marker}):
            with self.subTest(shape=type(value).__name__):
                payload = json.loads(self.raw)
                payload["data"]["modifiers"][marker] = value
                completed, out = self.synthetic(payload)
                assert completed.returncode == 0, completed.stderr
                output = (out / "published-premade.reduced.json").read_bytes()
                assert marker.encode() not in output
                assert hashlib.sha256(output).hexdigest() == REDUCED_SHA256
                assert marker not in completed.stdout + completed.stderr

    def test_missing_supported_modifier_groups_are_not_invented(self) -> None:
        supported = {"background", "class", "condition", "feat", "item", "race"}
        for group in sorted(supported):
            with self.subTest(group=group):
                payload = json.loads(self.raw)
                del payload["data"]["modifiers"][group]
                completed, out = self.synthetic(payload)
                assert completed.returncode == 0, completed.stderr
                assert set(self.read_output(out)["data"]["modifiers"]) == supported - {
                    group
                }

    def test_missing_and_null_optional_fields_are_distinct(self) -> None:
        for field in ("armorClass", "overrideHitPoints"):
            for state in ("missing", "null", "value"):
                with self.subTest(field=field, state=state):
                    payload = json.loads(self.raw)
                    if state == "missing":
                        payload["data"].pop(field, None)
                    else:
                        payload["data"][field] = None if state == "null" else 14
                    completed, out = self.synthetic(payload)
                    assert completed.returncode == 0, completed.stderr
                    reduced = self.read_output(out)["data"]
                    if state == "missing":
                        assert field not in reduced
                    else:
                        assert reduced[field] == payload["data"][field]

    def test_nullable_fallback_fields_retain_only_parser_inputs(self) -> None:
        payload = json.loads(self.raw)
        payload["data"]["race"].pop("fullName")
        payload["data"]["background"]["definition"] = None
        payload["data"]["background"]["customBackground"] = {
            "name": None,
            "description": "UNUSED",
        }
        completed, out = self.synthetic(payload)
        assert completed.returncode == 0, completed.stderr
        data = self.read_output(out)["data"]
        assert data["race"] == {"baseName": "Goliath"}
        assert data["background"] == {
            "definition": None,
            "customBackground": {"name": None},
        }
        payload["data"]["race"]["fullName"] = None
        payload["data"]["background"]["customBackground"]["name"] = "Custom name"
        completed, out = self.synthetic(payload)
        assert completed.returncode == 0, completed.stderr
        assert self.read_output(out)["data"]["race"]["fullName"] is None
        assert self.read_output(out)["data"]["background"]["customBackground"] == {
            "name": "Custom name"
        }

    def test_invalid_inputs_fail_without_overwriting_prior_output(self) -> None:
        completed, out = self.invoke()
        assert completed.returncode == 0, completed.stderr
        before = {p.name: p.read_bytes() for p in out.iterdir()}
        bad_metadata = copy.deepcopy(self.provenance)
        bad_metadata["sha256"] = "0" * 64
        bad_size = copy.deepcopy(self.provenance)
        bad_size["bytes"] += 1
        authenticated = copy.deepcopy(self.provenance)
        authenticated["authenticated"] = True
        malformed = b'{"PRIVATE_UNUSED_SENTINEL":'
        duplicate = b'{"success":true,"success":false}'
        bad_structure = json.loads(self.raw)
        bad_structure["data"]["classes"] = {}
        cases = [
            (self.raw, bad_metadata),
            (self.raw, bad_size),
            (self.raw, authenticated),
        ]
        nested_private = json.loads(self.raw)
        nested_private["data"]["classes"][0]["definition"]["name"] = {
            "description": "PRIVATE_UNUSED_SENTINEL"
        }
        for raw in (
            malformed,
            duplicate,
            b"NaN",
            json.dumps(bad_structure).encode(),
            json.dumps(nested_private).encode(),
        ):
            metadata = copy.deepcopy(self.provenance)
            metadata.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
            cases.append((raw, metadata))
        for index, (raw, metadata) in enumerate(cases):
            with self.subTest(case=index):
                failed, _ = self.invoke(raw, metadata)
                assert failed.returncode != 0
                assert failed.stdout == ""
                assert "PRIVATE_UNUSED_SENTINEL" not in failed.stderr
                assert "Traceback" not in failed.stderr
                assert before == {p.name: p.read_bytes() for p in out.iterdir()}

    def test_required_cli_arguments_are_enforced(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT)], capture_output=True, text=True, check=False
        )
        assert result.returncode == 2
        assert "--source" in result.stderr
        assert "--provenance" in result.stderr
        assert "--out" in result.stderr


if __name__ == "__main__":
    unittest.main()
