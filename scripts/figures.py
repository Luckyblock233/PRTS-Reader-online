"""Resolve exact AVG artwork from a pinned Git tree and cache PNGs locally."""

from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
import argparse
import collections
import hashlib
import json
import threading
from data_store import dataset_dir

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
ASSETS = ROOT / "reader/assets"
LOCK = threading.Lock()


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def fetch(url, limit=8_000_000):
    with urlopen(Request(url, headers={"User-Agent": "PRTS-Reader/0.1.0"}), timeout=20) as r:
        data = r.read(limit + 1)
    if len(data) > limit:
        raise ValueError("图片或索引超过大小限制")
    return data


def usage(snapshot=""):
    base = dataset_dir(snapshot)
    path = base / "figure-usage.json"
    if path.exists():
        return load(path)
    catalog = load(base / "catalog.json")
    snapshot_id = catalog["snapshot"]["id"]
    path = RAW / ("figure-usage-" + snapshot_id + ".json")
    if path.exists():
        return load(path)
    legacy = RAW / "figure-usage.json"
    manifest = RAW / "manifest.json"
    if (
        legacy.exists()
        and manifest.exists()
        and load(manifest).get("assets", {}).get("zh_CN.zip", {}).get("sha256") == snapshot_id
    ):
        return load(legacy)
    counts = collections.Counter()
    for meta in catalog["chapters"]:
        doc = load(base / "chapters" / (meta["id"] + ".json"))
        counts.update(
            line["raw"]["figure_art"]
            for line in doc["lines"]
            if isinstance(line["raw"].get("figure_art"), str) and line["raw"]["figure_art"]
        )
    dump(path, dict(counts))
    return dict(counts)


def resolve(ref, snapshot=""):
    if not isinstance(ref, str) or ref not in usage(snapshot):
        return {"status": "missing", "ref": ref, "message": "本地剧情未引用此资源"}
    with LOCK:
        path = ASSETS / "figure-index.json"
        index = (
            load(path) if path.exists() else {"schemaVersion": "reader-figures/v1", "figures": {}}
        )
        previous = index["figures"].get(ref)
        if previous and (ASSETS / previous["file"]).is_file():
            return {"status": "ready", **previous}
        source = load(ROOT / "config/figure-source.json")
        if not (RAW / "asset-characters.json").exists():
            tree = json.loads(
                fetch(
                    f"https://api.github.com/repos/{source['repo']}/git/trees/{source['directoryTree']}"
                )
            )
            if tree.get("truncated"):
                raise ValueError("目录索引不完整")
            dump(RAW / "asset-characters.json", tree)
        entries = load(RAW / "asset-characters.json")["tree"]
        lookup = {e["path"].casefold(): e for e in entries}
        entry = lookup.get((ref + ".png").casefold())
        prefix = source["directory"]
        if not entry:
            base = ref.split("#", 1)[0].split("$", 1)[0]
            folder = lookup.get(base.casefold())
            if folder and folder["type"] == "tree":
                cache = RAW / "figure-trees" / (folder["sha"] + ".json")
                if cache.exists():
                    sub = load(cache)
                else:
                    sub = json.loads(fetch(folder["url"]))
                    if sub.get("truncated"):
                        raise ValueError("立绘子目录索引不完整")
                    dump(cache, sub)
                files = {e["path"].casefold(): e for e in sub["tree"] if e["type"] == "blob"}
                candidates = [ref + ".png"]
                if "#" in ref and "$" not in ref:
                    expression = ref.split("#", 1)[1]
                    # Legacy folders number expressions as prefix_N.png;
                    # modern folders retain # and $ verbatim (preferred above).
                    candidates += [
                        base.rsplit("_", 1)[0] + "_" + expression + ".png",
                        base + "_" + expression + ".png",
                    ]
                if "#" not in ref:
                    candidates.append(base + ".png")
                entry = next(
                    (files[n.casefold()] for n in candidates if n.casefold() in files), None
                )
                prefix += "/" + folder["path"]
        if not entry or entry["type"] != "blob":
            return {
                "status": "missing",
                "ref": ref,
                "message": "固定资源快照中未找到精确对应的 PNG；未替换成其他立绘",
            }
        asset_path = prefix + "/" + entry["path"]
        url = f"https://raw.githubusercontent.com/{source['repo']}/{source['commit']}/" + quote(
            asset_path, safe="/"
        )
        data = fetch(url)
        blob_sha = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if (
            not data.startswith(b"\x89PNG\r\n\x1a\n")
            or blob_sha != entry["sha"]
            or len(data) != entry["size"]
        ):
            raise ValueError("PNG 签名、大小或 Git blob SHA 校验失败")
        filename = "figures/" + hashlib.sha256(ref.encode()).hexdigest()[:24] + ".png"
        target = ASSETS / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        result = {
            "ref": ref,
            "file": filename,
            "sourcePath": asset_path,
            "url": url,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "gitBlob": blob_sha,
            "commit": source["commit"],
        }
        index["source"] = source
        index["figures"][ref] = result
        dump(path, index)
        return {"status": "ready", **result}


def seed(limit):
    counts = usage()
    refs = sorted(counts, key=counts.get, reverse=True)[:limit]
    report = []
    for ref in refs:
        try:
            result = resolve(ref)
            report.append({"ref": ref, "status": result["status"]})
            print(ref, result["status"], flush=True)
        except Exception as e:
            report.append({"ref": ref, "status": "error", "error": type(e).__name__})
            print(ref, "download failed:", type(e).__name__, flush=True)
    dump(
        ROOT / "docs/figure-download-report.json",
        {
            "referencedResources": len(counts),
            "attempts": report,
            "ready": sum(r["status"] == "ready" for r in report),
            "source": load(ROOT / "config/figure-source.json"),
        },
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=40)
    parser.add_argument("--ref")
    args = parser.parse_args()
    if args.ref:
        print(json.dumps(resolve(args.ref), ensure_ascii=False))
    else:
        seed(args.seed)
