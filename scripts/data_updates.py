"""Manually checked GitHub data releases; stage, verify and switch a reader snapshot."""

from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import hashlib
import json
import os
import re
import shutil
import threading
import uuid
import zipfile

from data_store import ROOT, descriptor, read_json
from prepare import build

REPOSITORY = "3aKHP/arknights-data-pipeline"
API = "https://api.github.com/repos/" + REPOSITORY
DOWNLOAD = "https://github.com/" + REPOSITORY + "/releases/download/"


class UpdateError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(timezone.utc).isoformat()


def fetch_json(url):
    request = Request(
        url, headers={"User-Agent": "PRTS-Reader/0.1.0", "Accept": "application/json"}
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = response.read(16 * 1024 * 1024 + 1)
            if len(payload) > 16 * 1024 * 1024:
                raise UpdateError("发布信息过大，无法检查", 502)
            return json.loads(payload.decode("utf-8-sig"))
    except HTTPError as error:
        message = (
            "GitHub 请求受限，请稍后重试"
            if error.code in (403, 429)
            else f"发布信息请求失败（HTTP {error.code}）"
        )
        raise UpdateError(message, 502) from None
    except (URLError, TimeoutError, ValueError) as error:
        if isinstance(error, UpdateError):
            raise
        raise UpdateError("无法读取 GitHub 发布信息，请检查网络后重试", 502) from None


def download_asset(asset, path, progress):
    expected = asset["size"]
    received = 0
    digest = hashlib.sha256()
    request = Request(asset["browser_download_url"], headers={"User-Agent": "PRTS-Reader/0.1.0"})
    with urlopen(request, timeout=90) as response, path.open("wb") as file:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            received += len(chunk)
            if received > expected:
                raise UpdateError("下载长度超过发布信息，更新已停止")
            file.write(chunk)
            digest.update(chunk)
            progress(received, expected)
    if received != expected:
        raise UpdateError("下载不完整，更新已停止")
    if asset.get("digest") and asset["digest"] != "sha256:" + digest.hexdigest():
        raise UpdateError("GitHub 下载校验失败，更新已停止")


def version_key(tag):
    match = re.search(r"(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})", tag)
    return tuple(map(int, match.groups())) if match else ()


def assets_for(release):
    if (
        release.get("draft")
        or release.get("prerelease")
        or not str(release.get("tag_name", "")).startswith("data-")
    ):
        raise UpdateError("该发布不是正式剧情数据包")
    assets = {
        asset["name"]: asset
        for asset in release.get("assets", [])
        if asset.get("name") in ("manifest.json", "zh_CN.zip")
    }
    if len(assets) != 2:
        raise UpdateError("发布包缺少 manifest.json 或 zh_CN.zip")
    for asset in assets.values():
        url = asset.get("browser_download_url", "")
        if (
            not url.startswith(DOWNLOAD)
            or "?" in url
            or "#" in url
            or "/" + release["tag_name"] + "/" not in url
        ):
            raise UpdateError("发布包下载地址不属于固定数据源")
        if type(asset.get("size")) is not int or not 0 < asset["size"] <= 2 * 1024**3:
            raise UpdateError("发布包大小无效或超过 2 GB 限制")
    return assets


def expected_zip(manifest):
    if manifest.get("contractVersion") != "prts-mcp-data/v1":
        raise UpdateError("此发布的数据格式暂不兼容，未更新")
    expected = manifest.get("assets", {}).get("zh_CN.zip", {})
    if (
        not re.fullmatch("[0-9a-f]{64}", str(expected.get("sha256", "")))
        or type(expected.get("size")) is not int
        or expected["size"] <= 0
    ):
        raise UpdateError("发布清单中的 ZIP 校验信息无效")
    return expected


def fingerprint(release):
    return [
        (name, asset.get("id"), asset["size"], asset.get("digest"), asset["browser_download_url"])
        for name, asset in sorted(assets_for(release).items())
    ]


def validate_projection(path, snapshot_id):
    catalog = read_json(path / "catalog.json")
    records = read_json(path / "search.json")
    if (
        catalog.get("schemaVersion") != "source-reader/v1"
        or catalog["snapshot"]["id"] != snapshot_id
        or not catalog["chapters"]
        or not records
    ):
        raise UpdateError("重建后的资料库不完整，未切换")
    chapters = {chapter["id"]: chapter for chapter in catalog["chapters"]}
    for cid, meta in chapters.items():
        if not re.fullmatch("[0-9a-f]{24}", cid):
            raise UpdateError("篇章编号无效，未切换")
        document = read_json(path / "chapters" / (cid + ".json"))
        if document["meta"] != meta or len(document["lines"]) != meta["lineCount"]:
            raise UpdateError("篇章投影校验失败，未切换")
    for record in records:
        meta = chapters.get(record["chapter"])
        if (
            not meta
            or type(record["index"]) is not int
            or not 0 <= record["index"] < meta["lineCount"]
        ):
            raise UpdateError("全文索引定位无效，未切换")
    return {"chapters": len(chapters), "searchableLines": len(records)}


class UpdateManager:
    def __init__(
        self,
        root=ROOT,
        current=descriptor,
        get_json=fetch_json,
        download=download_asset,
        builder=build,
    ):
        self.root = root
        self.current = current
        self.get_json = get_json
        self.download = download
        self.builder = builder
        self.lock = threading.RLock()
        self.candidate = None
        self.job = {"state": "idle", "phase": "idle", "message": "点击检查更新后访问 GitHub。"}

    def status(self):
        with self.lock:
            return {**self.job, "current": self.current(), "candidate": self.public_candidate()}

    def public_candidate(self):
        if not self.candidate:
            return None
        return {
            key: self.candidate[key]
            for key in (
                "token",
                "releaseTag",
                "releaseUrl",
                "publishedAt",
                "size",
                "sha256",
                "available",
                "astr",
                "checkedAt",
                "message",
            )
        }

    def check(self):
        with self.lock:
            if self.job["state"] == "running":
                raise UpdateError("更新正在进行，请等待完成", 409)
            local = self.current()["snapshot"]
            releases = self.get_json(API + "/releases?per_page=30")
            eligible = []
            for release in releases:
                try:
                    assets_for(release)
                except UpdateError:
                    continue
                eligible.append(release)
            if not eligible:
                raise UpdateError("未找到包含中文剧情的正式发布包", 502)
            release = max(
                eligible,
                key=lambda item: (
                    version_key(item["tag_name"]),
                    item.get("published_at") or "",
                    item["id"],
                ),
            )
            assets = assets_for(release)
            manifest = self.get_json(assets["manifest.json"]["browser_download_url"])
            expected = expected_zip(manifest)
            if expected["size"] != assets["zh_CN.zip"]["size"]:
                raise UpdateError("清单与 GitHub ZIP 长度不一致")
            if assets["zh_CN.zip"].get("digest") not in (None, "sha256:" + expected["sha256"]):
                raise UpdateError("清单与 GitHub ZIP 哈希不一致")
            newer = version_key(release["tag_name"]) >= version_key(local["releaseTag"]) and (
                release["tag_name"] == local["releaseTag"]
                or release["published_at"] >= local["publishedAt"]
            )
            available = expected["sha256"] != local["id"] and newer
            self.candidate = {
                "token": uuid.uuid4().hex,
                "release": release,
                "manifest": manifest,
                "fromSnapshot": local["id"],
                "releaseTag": release["tag_name"],
                "releaseUrl": release["html_url"],
                "publishedAt": release["published_at"],
                "size": expected["size"],
                "sha256": expected["sha256"],
                "available": available,
                "astr": manifest.get("tools", {}).get("ASTR-Script"),
                "checkedAt": now(),
                "message": "发现可更新的剧情数据包。"
                if available
                else "当前已是最新可用数据；未发现更新包。",
            }
            self.job = {"state": "idle", "phase": "idle", "message": self.candidate["message"]}
            return self.status()

    def start(self, token):
        with self.lock:
            if self.job["state"] == "running":
                raise UpdateError("更新正在进行，请勿重复提交", 409)
            if (
                not self.candidate
                or token != self.candidate["token"]
                or not self.candidate["available"]
            ):
                raise UpdateError("请先检查更新，并选择当前检查到的版本", 409)
            candidate = dict(self.candidate)
            self.job = {
                "state": "running",
                "phase": "prepare",
                "message": "正在准备更新…",
                "startedAt": now(),
            }
            threading.Thread(target=self.run, args=(candidate,), daemon=True).start()
            return self.status()

    def progress(self, phase, message, **values):
        with self.lock:
            self.job.update(phase=phase, message=message, **values)

    def run(self, candidate):
        workspace = self.root / "data/update-work" / uuid.uuid4().hex
        try:
            if self.current()["snapshot"]["id"] != candidate["fromSnapshot"]:
                raise UpdateError("当前版本已改变，请重新检查更新")
            release = self.get_json(API + "/releases/" + str(candidate["release"]["id"]))
            if fingerprint(release) != fingerprint(candidate["release"]):
                raise UpdateError("发布附件已改变，请重新检查更新")
            assets = assets_for(release)
            manifest = self.get_json(assets["manifest.json"]["browser_download_url"])
            if manifest != candidate["manifest"]:
                raise UpdateError("发布清单已改变，请重新检查更新")
            raw = workspace / "raw"
            raw.mkdir(parents=True)
            (raw / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
            )
            release_path = workspace / "release.json"
            release_path.write_text(json.dumps(release, ensure_ascii=False), encoding="utf-8")
            archive = raw / "zh_CN.zip"
            self.progress(
                "download", "正在下载中文剧情包…", bytesReceived=0, totalBytes=candidate["size"]
            )
            self.download(
                assets["zh_CN.zip"],
                archive,
                lambda done, total: self.progress(
                    "download", "正在下载中文剧情包…", bytesReceived=done, totalBytes=total
                ),
            )
            self.progress("verify", "正在校验 ZIP 长度与 SHA-256…")
            digest = hashlib.sha256()
            with archive.open("rb") as file:
                for block in iter(lambda: file.read(1024 * 1024), b""):
                    digest.update(block)
            if (
                archive.stat().st_size != candidate["size"]
                or digest.hexdigest() != candidate["sha256"]
            ):
                raise UpdateError("发布包 SHA-256 或长度校验失败，原数据保持可用")
            with zipfile.ZipFile(archive) as package:
                if sum(item.file_size for item in package.infolist()) > 6 * 1024**3 or any(
                    item.file_size > 128 * 1024**2 for item in package.infolist()
                ):
                    raise UpdateError("ZIP 解压后体积超出本地处理范围")
            self.progress("build", "正在重建篇章、目录与全文检索索引…")
            projection = workspace / "projection"
            self.builder(
                raw=raw, out=projection, release_path=release_path, reports=workspace / "reports"
            )
            self.progress("validate", "正在核对篇章与检索定位…")
            counts = validate_projection(projection, candidate["sha256"])
            if self.current()["snapshot"]["id"] != candidate["fromSnapshot"]:
                raise UpdateError("当前版本已改变，未切换，请重新检查")
            self.progress("activate", "校验完成，正在切换资料库…")
            destination = self.root / "reader/snapshots" / candidate["sha256"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                validate_projection(destination, candidate["sha256"])
            else:
                os.replace(projection, destination)
            retained = self.root / "data/releases" / candidate["sha256"]
            retained.parent.mkdir(parents=True, exist_ok=True)
            if not retained.exists():
                os.replace(workspace, retained)
            pointer = self.root / "data/active-reader.json"
            temporary = pointer.with_name("active-reader." + uuid.uuid4().hex + ".tmp")
            try:
                temporary.write_text(
                    json.dumps(
                        {
                            "snapshotId": candidate["sha256"],
                            "previousSnapshotId": candidate["fromSnapshot"],
                            "activatedAt": now(),
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding="utf-8",
                )
                os.replace(temporary, pointer)
            finally:
                temporary.unlink(missing_ok=True)
            with self.lock:
                self.candidate = None
                self.job.update(
                    state="complete",
                    phase="complete",
                    message="更新完成。重新载入应用以使用新数据。",
                    finishedAt=now(),
                    **counts,
                )
        except Exception as error:
            message = (
                str(error) if isinstance(error, UpdateError) else "更新失败：" + str(error)[:250]
            )
            with self.lock:
                self.job.update(state="failed", phase="failed", message=message, finishedAt=now())
        finally:
            if workspace.exists() and workspace.resolve().is_relative_to(
                (self.root / "data/update-work").resolve()
            ):
                shutil.rmtree(workspace)


MANAGER = UpdateManager()
