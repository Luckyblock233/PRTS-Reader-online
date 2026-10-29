from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, mock
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import home_content


class HomeDefaultsTests(TestCase):
    def test_missing_local_home_uses_default_and_save_creates_override(self):
        with TemporaryDirectory(dir=Path(__file__).resolve().parent) as directory:
            root = Path(directory)
            local = root / "home.json"
            default = root / "home.example.json"
            initial = {
                "title": "默认首页",
                "intro": "默认说明",
                "sections": [{"title": "阅读", "body": "合成说明"}],
            }
            default.write_text(json.dumps(initial), encoding="utf-8")
            with (
                mock.patch.object(home_content, "HOME_PATH", local),
                mock.patch.object(home_content, "DEFAULT_PATH", default),
            ):
                self.assertEqual(home_content.read_home(), initial)
                changed = {**initial, "title": "私人首页"}
                home_content.save_home(changed)
                self.assertEqual(home_content.read_home(), changed)
                self.assertEqual(json.loads(default.read_text(encoding="utf-8")), initial)
