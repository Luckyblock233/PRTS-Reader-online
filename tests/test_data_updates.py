from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch
import hashlib
import io
import json
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import data_store
from data_updates import UpdateManager, UpdateError, API, DOWNLOAD, validate_projection


class DataUpdateTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.old_id = "a" * 64
        self.old = {
            "id": self.old_id,
            "releaseTag": "data-26-10-14-13-45-10-old",
            "publishedAt": "2026-10-15T00:00:00Z",
        }
        base = self.root / "reader/data"
        base.mkdir(parents=True)
        (base / "catalog.json").write_text(
            json.dumps({"snapshot": self.old, "chapters": [{"id": "original"}]}), encoding="utf-8"
        )
        self.payload = io.BytesIO()
        with zipfile.ZipFile(self.payload, "w") as package:
            package.writestr(
                "zh_CN/gamedata/story/test.json",
                json.dumps(
                    {
                        "storyName": "新剧情",
                        "storyCode": "T-1",
                        "storyList": [
                            {
                                "id": 100,
                                "prop": "name",
                                "attributes": {"name": "阿米娅", "content": "新版本的罗德岛。"},
                            },
                            {"id": 102, "prop": "Decision", "attributes": {"options": "继续;等待"}},
                        ],
                    },
                    ensure_ascii=False,
                ),
            )
        self.content = self.payload.getvalue()
        self.new_id = hashlib.sha256(self.content).hexdigest()
        self.manifest = {
            "contractVersion": "prts-mcp-data/v1",
            "source": {"versionId": "26-10-22-14-02-11-new"},
            "pipeline": {"commit": "test-pipeline"},
            "tools": {
                "ASTR-Script": {"source": "050644zf/ASTR-Script", "sourceCommit": "test-astr"}
            },
            "assets": {"zh_CN.zip": {"sha256": self.new_id, "size": len(self.content)}},
        }
        self.release = {
            "id": 123,
            "tag_name": "data-26-10-22-14-02-11-new",
            "html_url": "https://github.com/3aKHP/arknights-data-pipeline/releases/tag/test",
            "published_at": "2026-10-25T00:00:00Z",
            "assets": [],
        }
        for i, name in enumerate(["manifest.json", "zh_CN.zip"]):
            self.release["assets"].append(
                {
                    "id": i + 1,
                    "name": name,
                    "size": len(self.content) if name.endswith(".zip") else 100,
                    "browser_download_url": DOWNLOAD + self.release["tag_name"] + "/" + name,
                }
            )

        def current():
            pointer = self.root / "data/active-reader.json"
            if pointer.exists():
                sid = json.loads(pointer.read_text())["snapshotId"]
                directory = self.root / "reader/snapshots" / sid
            else:
                directory = base
            catalog = json.loads((directory / "catalog.json").read_text(encoding="utf-8"))
            return {
                "snapshot": catalog["snapshot"],
                "dataBase": directory.relative_to(self.root / "reader").as_posix(),
                "chapters": len(catalog["chapters"]),
            }

        def fetch(url):
            if url == API + "/releases?per_page=30":
                return [{"tag_name": "images-new"}, self.release]
            if url == API + "/releases/123":
                return self.release
            if url.endswith("/manifest.json"):
                return self.manifest
            raise AssertionError(url)

        def download(asset, path, progress):
            path.write_bytes(self.content)
            progress(len(self.content), len(self.content))

        self.manager = UpdateManager(self.root, current, fetch, download)

    def checked(self):
        result = self.manager.check()
        self.assertTrue(result["candidate"]["available"])
        return dict(self.manager.candidate)

    def assert_old_untouched(self):
        self.assertEqual(self.manager.current()["snapshot"]["id"], self.old_id)
        self.assertTrue((self.root / "reader/data/catalog.json").is_file())

    def test_check_skips_images_and_does_not_download_or_switch(self):
        with patch.object(
            self.manager, "download", side_effect=AssertionError("must not download")
        ):
            candidate = self.checked()
        self.assertEqual(candidate["astr"]["sourceCommit"], "test-astr")
        self.assert_old_untouched()
        self.assertFalse((self.root / "data/update-work").exists())

    def test_real_builder_switches_only_after_validation_keeps_old_snapshot(self):
        candidate = self.checked()
        self.manager.run(candidate)
        self.assertEqual(self.manager.job["state"], "complete")
        self.assertEqual(self.manager.current()["snapshot"]["id"], self.new_id)
        self.assertEqual(
            validate_projection(self.root / "reader/snapshots" / self.new_id, self.new_id),
            {"chapters": 1, "searchableLines": 2},
        )
        self.assertEqual(
            json.loads((self.root / "reader/data/catalog.json").read_text())["snapshot"], self.old
        )
        self.assertTrue((self.root / "data/releases" / self.new_id / "raw/zh_CN.zip").is_file())
        self.assertEqual(
            self.manager.current()["snapshot"]["publishedAt"], self.release["published_at"]
        )
        self.assertFalse(self.manager.check()["candidate"]["available"])
        with (
            patch.object(data_store, "ROOT", self.root),
            patch.object(data_store, "ACTIVE", self.root / "data/active-reader.json"),
        ):
            self.assertEqual(data_store.descriptor()["snapshot"]["id"], self.new_id)
            self.assertEqual(data_store.dataset_dir(self.old_id), self.root / "reader/data")

    def test_corrupt_download_keeps_old_data(self):
        candidate = self.checked()
        self.manager.download = lambda asset, path, progress: path.write_bytes(b"corrupt")
        self.manager.run(candidate)
        self.assertEqual(self.manager.job["state"], "failed")
        self.assertIn("校验失败", self.manager.job["message"])
        self.assert_old_untouched()

    def test_build_error_keeps_old_data_and_cleans_staging(self):
        candidate = self.checked()
        self.manager.builder = lambda **args: (_ for _ in ()).throw(
            ValueError("unsupported source")
        )
        self.manager.run(candidate)
        self.assertEqual(self.manager.job["state"], "failed")
        self.assert_old_untouched()
        self.assertEqual(list((self.root / "data/update-work").iterdir()), [])

    def test_release_change_after_check_requires_recheck(self):
        candidate = self.checked()
        self.manager.get_json = lambda url: {
            **self.release,
            "assets": [{**asset, "id": 99} for asset in self.release["assets"]],
        }
        self.manager.run(candidate)
        self.assertIn("重新检查", self.manager.job["message"])
        self.assert_old_untouched()

    def test_activation_failure_preserves_pointer(self):
        candidate = self.checked()
        import os

        replace = os.replace

        def fail_pointer(source, destination):
            if Path(destination).name == "active-reader.json":
                raise OSError("pointer write failed")
            return replace(source, destination)

        with patch("data_updates.os.replace", side_effect=fail_pointer):
            self.manager.run(candidate)
        self.assertEqual(self.manager.job["state"], "failed")
        self.assert_old_untouched()

    def test_incompatible_manifest_rejected_before_install(self):
        self.manifest["contractVersion"] = "unknown/v2"
        with self.assertRaises(UpdateError):
            self.manager.check()
        self.assert_old_untouched()

    def test_unknown_token_and_duplicate_start_rejected(self):
        self.checked()
        with self.assertRaises(UpdateError):
            self.manager.start("other-token")
        self.manager.job["state"] = "running"
        with self.assertRaises(UpdateError):
            self.manager.start(self.manager.candidate["token"])
        with self.assertRaises(UpdateError):
            self.manager.check()
        self.assert_old_untouched()

    def test_older_release_never_offered_as_update(self):
        self.old["releaseTag"] = "data-26-11-01-00-00-00-future"
        self.old["publishedAt"] = "2026-11-02T00:00:00Z"
        (self.root / "reader/data/catalog.json").write_text(
            json.dumps({"snapshot": self.old, "chapters": []}), encoding="utf-8"
        )
        self.assertFalse(self.manager.check()["candidate"]["available"])


if __name__ == "__main__":
    main()
