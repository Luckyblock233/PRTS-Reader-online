"""Select a newer official story release; change only the reproducible data lock."""

from pathlib import Path
from urllib.parse import quote
import json
import os

from data_updates import (
    API,
    REPOSITORY,
    UpdateError,
    assets_for,
    expected_zip,
    fetch_json,
    version_key,
)

ROOT = Path(__file__).resolve().parents[1]


def discover(get_json=fetch_json):
    eligible = []
    for page in range(1, 11):
        releases = get_json(f"{API}/releases?per_page=100&page={page}")
        if not isinstance(releases, list):
            raise UpdateError("发布列表格式无效")
        for release in releases:
            try:
                assets_for(release)
            except UpdateError:
                continue
            if version_key(release["tag_name"]) and release.get("published_at"):
                eligible.append(release)
        if len(releases) < 100:
            break
    else:
        raise UpdateError("发布列表超过检查范围，请人工检查，未修改数据锁")
    if not eligible:
        raise UpdateError("未找到包含 manifest.json 和 zh_CN.zip 的正式剧情发布")
    return max(
        eligible,
        key=lambda item: (version_key(item["tag_name"]), item["published_at"], item["id"]),
    )


def update_lock(root=ROOT, get_json=fetch_json):
    path = root / "config/data-source.json"
    current = json.loads(path.read_text(encoding="utf-8"))
    if current["repository"] != REPOSITORY or current["asset"] != "zh_CN.zip":
        raise UpdateError("仅允许固定剧情数据源")
    release = discover(get_json)
    tag = release["tag_name"]
    if version_key(tag) < version_key(current["releaseTag"]):
        return {"changed": False, "releaseTag": current["releaseTag"], "reason": "拒绝降级"}
    if tag != current["releaseTag"]:
        previous = get_json(API + "/releases/tags/" + quote(current["releaseTag"], safe=""))
        if not previous.get("published_at"):
            raise UpdateError("无法确认当前版本发布时间，未更新")
        if release["published_at"] < previous["published_at"]:
            return {"changed": False, "releaseTag": current["releaseTag"], "reason": "拒绝降级"}
    assets = assets_for(release)
    manifest = get_json(assets["manifest.json"]["browser_download_url"])
    expected = expected_zip(manifest)
    archive = assets["zh_CN.zip"]
    if expected["size"] != archive["size"]:
        raise UpdateError("发布清单与 ZIP 长度不一致")
    if archive.get("digest") not in (None, "sha256:" + expected["sha256"]):
        raise UpdateError("发布清单与 ZIP 哈希不一致")
    if expected["sha256"] == current["sha256"]:
        return {"changed": False, "releaseTag": current["releaseTag"], "reason": "数据内容未变化"}
    # This is only a candidate. The workflow verifies the actual ZIP, projections,
    # tests and Astro build before committing this single file to main.
    candidate = {**current, "releaseTag": tag, "sha256": expected["sha256"]}
    path.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"changed": True, "releaseTag": tag, "sha256": expected["sha256"]}


if __name__ == "__main__":
    result = update_lock()
    print(json.dumps(result, ensure_ascii=False))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"changed={str(result['changed']).lower()}\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write(
                "剧情数据检查结果：\n```json\n" + json.dumps(result, ensure_ascii=False) + "\n```\n"
            )
