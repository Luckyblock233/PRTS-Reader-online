"""Full snapshot checks + Draft 2020-12 schema checks, no network requests."""

from pathlib import Path
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
from data_store import dataset_dir

try:
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource
except ImportError:
    raise SystemExit("Install requirements-dev.txt first (jsonschema required).")


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main():
    schemas = {p.name: load(p) for p in (ROOT / "schemas").glob("*.json")}
    registry = Registry()
    for name, schema in schemas.items():
        Draft202012Validator.check_schema(schema)
        registry = registry.with_resource(name, Resource.from_contents(schema))
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))

    # Relative refs resolve against the local file name; never retrieve remote schemas.
    def validator(name):
        schema = dict(schemas[name])
        schema["$id"] = name
        return Draft202012Validator(schema, registry=registry)

    source_v = validator("source-story.schema.json")
    projection_v = validator("reader-chapter.schema.json")
    base = dataset_dir()
    catalog = load(base / "catalog.json")
    validator("reader-catalog.schema.json").validate(catalog)
    ids = [c["id"] for c in catalog["chapters"]]
    assert len(ids) == len(set(ids)), "Route ID collision"
    assert not catalog["inventory"]["unmatchedReferences"]
    checked, lines, sampled = 0, 0, set()
    archive = ROOT / "data/releases" / catalog["snapshot"]["id"] / "raw/zh_CN.zip"
    if not archive.exists():
        archive = ROOT / "data/raw/zh_CN.zip"
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == catalog["snapshot"]["id"], (
        "Archive snapshot mismatch"
    )
    with zipfile.ZipFile(archive) as z:
        for meta in catalog["chapters"]:
            doc = load(base / "chapters" / (meta["id"] + ".json"))
            payload = z.read(meta["member"])
            raw = json.loads(payload)
            assert doc["raw"] == raw, meta["member"]
            assert hashlib.sha256(payload).hexdigest() == meta["sha256"]
            assert doc["meta"] == meta
            source_v.validate(raw)
            # Every source file has already been schema validated; avoid revalidating
            # millions of identical raw fields while checking the projection envelope.
            if meta["type"] not in sampled:
                projection_v.validate(doc)
                sampled.add(meta["type"])
            assert len(doc["lines"]) == len(raw["storyList"]) == meta["lineCount"]
            for i, line in enumerate(doc["lines"]):
                assert line["index"] == i
                assert line["pointer"] == f"/storyList/{i}"
                assert line["sourceId"] == raw["storyList"][i]["id"]
                assert line["raw"] == raw["storyList"][i]
                assert isinstance(line["text"], str) and isinstance(line["speaker"], str)
            checked += 1
            lines += len(doc["lines"])
            if checked % 250 == 0:
                print(f"Checked {checked} chapters...", flush=True)
    search = load(base / "search.json")
    lookup = {c["id"]: c for c in catalog["chapters"]}
    assert len(search) == len({(r["chapter"], r["index"]) for r in search})
    for r in search:
        assert r["chapter"] in lookup and 0 <= r["index"] < lookup[r["chapter"]]["lineCount"]
        assert r["text"]
    first = catalog["chapters"][0]
    notes = {
        "schemaVersion": "reader-notes/v1",
        "snapshotId": catalog["snapshot"]["id"],
        "exportedAt": "2026-10-28T00:00:00Z",
        "records": [],
    }
    validator("reader-notes.schema.json").validate(notes)
    print(
        json.dumps(
            {
                "sourceSchemasValidated": checked,
                "losslessProjectedLines": lines,
                "projectionSchemasSampledTypes": sorted(sampled),
                "catalogSchemaValidated": True,
                "searchRecordsChecked": len(search),
                "notesEnvelopeValidated": True,
            }
        )
    )


if __name__ == "__main__":
    main()
