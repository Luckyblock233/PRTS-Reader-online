from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from home_content import read_home, save_home, HomeError


class HomeContentTests(TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "home.json"
        self.original = {
            "title": "我的考察室",
            "intro": "保存到本地。",
            "sections": [{"title": "用途", "body": "第一段\n第二段"}],
        }
        save_home(self.original, self.path)

    def test_edit_survives_reload_and_keeps_text_literal(self):
        changed = {**self.original, "intro": "<script>alert(1)</script> 纯文本"}
        save_home(changed, self.path)
        self.assertEqual(read_home(self.path), changed)

    def test_invalid_edit_does_not_overwrite_saved_content(self):
        for change in (
            {"title": " "},
            {"sections": []},
            {"sections": [{}]},
            {"sections": self.original["sections"] * 9},
            {"intro": None},
        ):
            with self.subTest(change=change), self.assertRaises(HomeError):
                save_home({**self.original, **change}, self.path)
            self.assertEqual(read_home(self.path), self.original)

    def test_failed_replace_preserves_previous_file_and_cleans_temporary(self):
        with patch("home_content.os.replace", side_effect=OSError("disk error")):
            with self.assertRaises(OSError):
                save_home({**self.original, "title": "新标题"}, self.path)
        self.assertEqual(read_home(self.path), self.original)
        self.assertEqual(list(self.path.parent.iterdir()), [self.path])


if __name__ == "__main__":
    main()
