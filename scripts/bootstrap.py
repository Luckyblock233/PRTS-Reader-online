"""Download the pinned public data package and prepare a standalone reader checkout."""

from pathlib import Path
from urllib.parse import quote
import argparse
import hashlib
import json

from data_updates import (
    API,
    REPOSITORY,
    assets_for,
    expected_zip,
    fetch_json,
    download_asset,
    UpdateError,
)
from prepare import build

ROOT = Path(__file__).resolve().parents[1]


def bootstrap(root=ROOT, download_only=False, get_json=fetch_json, download=download_asset):
    source = json.loads((root / "config/data-source.json").read_text(encoding="utf-8"))
    if source["repository"] != REPOSITORY or source["asset"] != "zh_CN.zip":
        raise UpdateError(
            "Unsupported data source; update the adapter before changing repositories."
        )
    raw = root / "data/raw"
    raw.mkdir(parents=True, exist_ok=True)
    archive = raw / "zh_CN.zip"
    existing = False
    if archive.exists():
        digest = hashlib.sha256()
        with archive.open("rb") as file:
            for block in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(block)
        existing = digest.hexdigest() == source["sha256"] and (raw / "manifest.json").exists()
    metadata = raw / "release.json"
    legacy = root / "release-latest.json"
    if not existing or not (metadata.exists() or legacy.exists()):
        release = get_json(API + "/releases/tags/" + quote(source["releaseTag"], safe=""))
        if release.get("tag_name") != source["releaseTag"]:
            raise UpdateError("Release tag mismatch")
        assets = assets_for(release)
        manifest = get_json(assets["manifest.json"]["browser_download_url"])
        expected = expected_zip(manifest)
        if (
            expected["sha256"] != source["sha256"]
            or expected["size"] != assets["zh_CN.zip"]["size"]
        ):
            raise UpdateError("Pinned source does not match the release manifest")
        temporary = raw / "zh_CN.zip.part"
        try:
            download(
                assets["zh_CN.zip"],
                temporary,
                lambda done, total: print(f"Download: {done}/{total} bytes", flush=True),
            )
            digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
            if digest != source["sha256"] or temporary.stat().st_size != expected["size"]:
                raise UpdateError("Downloaded package does not match the pinned SHA-256")
            temporary.replace(archive)
        finally:
            temporary.unlink(missing_ok=True)
        (raw / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
        )
        metadata.write_text(json.dumps(release, ensure_ascii=False), encoding="utf-8")
    if not download_only:
        return build(
            raw=raw,
            out=root / "reader/data",
            release_path=metadata if metadata.exists() else legacy,
            reports=root / "data/reports",
        )
    return {"downloaded": True, "releaseTag": source["releaseTag"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-only", action="store_true")
    args = parser.parse_args()
    try:
        bootstrap(download_only=args.download_only)
    except (UpdateError, OSError, ValueError) as error:
        raise SystemExit(str(error)) from None
