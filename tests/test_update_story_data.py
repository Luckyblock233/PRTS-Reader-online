from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from data_updates import API, DOWNLOAD, REPOSITORY, UpdateError
from update_story_data import discover, update_lock


class StoryReleaseTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "config").mkdir()
        self.path = self.root / "config/data-source.json"
        self.current = {
            "repository": REPOSITORY,
            "releaseTag": "data-26-10-22-14-02-11-old",
            "asset": "zh_CN.zip",
            "sha256": "a" * 64,
        }
        self.path.write_text(json.dumps(self.current), encoding="utf-8")
        self.release = {
            "id": 2,
            "tag_name": "data-26-10-30-14-02-11-new",
            "published_at": "2026-10-31T00:00:00Z",
        }
        self.release["assets"] = [
            {
                "name": name,
                "size": 100,
                "browser_download_url": DOWNLOAD + self.release["tag_name"] + "/" + name,
            }
            for name in ("manifest.json", "zh_CN.zip")
        ]
        self.manifest = {
            "contractVersion": "prts-mcp-data/v1",
            "assets": {"zh_CN.zip": {"size": 100, "sha256": "b" * 64}},
        }

    def get_json(self, url):
        if "?per_page=" in url:
            return [self.release]
        if "/releases/tags/" in url:
            return {"published_at": "2026-10-25T00:00:00Z"}
        return self.manifest

    def test_new_release_updates_only_lock(self):
        self.assertTrue(update_lock(self.root, self.get_json)["changed"])
        result = json.loads(self.path.read_text())
        self.assertEqual(result["releaseTag"], self.release["tag_name"])
        self.assertEqual(result["sha256"], "b" * 64)
        self.assertEqual(result["repository"], REPOSITORY)
        self.assertEqual(list(self.root.rglob("*.json")), [self.path])

    def test_identical_content_does_not_change_lock(self):
        self.manifest["assets"]["zh_CN.zip"]["sha256"] = "a" * 64
        before = self.path.read_bytes()
        self.assertFalse(update_lock(self.root, self.get_json)["changed"])
        self.assertEqual(before, self.path.read_bytes())

    def test_older_release_never_downgrades(self):
        self.current["releaseTag"] = "data-26-11-01-00-00-00-newer"
        self.path.write_text(json.dumps(self.current))
        self.assertFalse(update_lock(self.root, self.get_json)["changed"])

    def test_invalid_manifest_or_hash_leaves_lock_unchanged(self):
        before = self.path.read_bytes()
        for change in ("contract", "size", "digest"):
            with self.subTest(change=change):
                manifest = deepcopy(self.manifest)
                if change == "contract":
                    self.manifest["contractVersion"] = "unsupported"
                elif change == "size":
                    self.manifest["assets"]["zh_CN.zip"]["size"] = 101
                else:
                    self.release["assets"][1]["digest"] = "sha256:" + "c" * 64
                with self.assertRaises(UpdateError):
                    update_lock(self.root, self.get_json)
                self.assertEqual(before, self.path.read_bytes())
                self.manifest = manifest

    def test_discovery_paginates_and_skips_prereleases(self):
        calls = []
        preview = {**self.release, "prerelease": True}

        def get(url):
            calls.append(url)
            return [preview] * 100 if url.endswith("&page=1") else [self.release]

        self.assertEqual(discover(get), self.release)
        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[1].startswith(API))

    def test_republished_same_tag_with_new_hash_is_verified(self):
        self.current["releaseTag"] = self.release["tag_name"]
        self.path.write_text(json.dumps(self.current))
        self.assertTrue(update_lock(self.root, self.get_json)["changed"])
