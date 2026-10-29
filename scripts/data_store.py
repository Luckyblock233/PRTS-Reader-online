"""Select immutable reader datasets through a small, atomically written pointer."""

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
ACTIVE = ROOT / "data/active-reader.json"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def dataset_dir(snapshot=""):
    if not snapshot:
        if not ACTIVE.exists():
            return ROOT / "reader/data"
        snapshot = read_json(ACTIVE)["snapshotId"]
    if not isinstance(snapshot, str) or not re.fullmatch(r"[0-9a-f]{64}", snapshot):
        raise ValueError("数据快照编号无效")
    version = ROOT / "reader/snapshots" / snapshot
    if (version / "catalog.json").is_file():
        return version
    legacy = ROOT / "reader/data"
    if read_json(legacy / "catalog.json")["snapshot"]["id"] == snapshot:
        return legacy
    raise ValueError("此数据快照不可用，请刷新阅读器")


def descriptor():
    base = dataset_dir()
    catalog = read_json(base / "catalog.json")
    return {
        "snapshot": catalog["snapshot"],
        "dataBase": base.relative_to(ROOT / "reader").as_posix(),
        "chapters": len(catalog["chapters"]),
    }
