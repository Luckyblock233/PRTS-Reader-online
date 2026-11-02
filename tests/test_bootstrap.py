from pathlib import Path
from unittest import TestCase, main
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from bootstrap import bootstrap
from data_updates import UpdateError
import test_data_updates as update_fixture


class BootstrapTests(TestCase):
    def setUp(self):
        self.fixture = update_fixture.DataUpdateTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.temp.cleanup)
        self.root = self.fixture.root
        (self.root / "config").mkdir()
        (self.root / "config/data-source.json").write_text(
            json.dumps(
                {
                    "repository": "3aKHP/arknights-data-pipeline",
                    "releaseTag": self.fixture.release["tag_name"],
                    "asset": "zh_CN.zip",
                    "sha256": self.fixture.new_id,
                }
            ),
            encoding="utf-8",
        )

        def fetch(url):
            if "/releases/tags/" in url:
                return self.fixture.release
            return self.fixture.manifest

        self.fetch = fetch

    def test_fresh_checkout_needs_no_upstream_repository(self):
        result = bootstrap(self.root, get_json=self.fetch, download=self.fixture.manager.download)
        self.assertEqual(result["chapters"], 1)
        self.assertFalse((self.root / "upstream").exists())
        self.assertTrue((self.root / "reader/data/figure-usage.json").exists())
        catalog = json.loads((self.root / "reader/data/catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(
            catalog["snapshot"],
            {
                "id": self.fixture.new_id,
                "releaseTag": self.fixture.release["tag_name"],
                "releaseUrl": self.fixture.release["html_url"],
                "publishedAt": self.fixture.release["published_at"],
            },
        )

        def no_network(*args):
            raise AssertionError("Existing verified package should be reused")

        bootstrap(self.root, get_json=no_network, download=no_network)

    def test_bad_download_is_not_promoted(self):
        def corrupt(asset, path, progress):
            path.write_bytes(b"wrong bytes")

        with self.assertRaises(UpdateError):
            bootstrap(self.root, get_json=self.fetch, download=corrupt)
        self.assertFalse((self.root / "data/raw/zh_CN.zip").exists())


if __name__ == "__main__":
    main()
