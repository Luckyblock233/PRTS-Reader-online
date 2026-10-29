from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main, mock
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import figures


class FigureTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_cached_image_works_without_game_data_or_network(self):
        assets = self.root / "assets"
        (assets / "figures").mkdir(parents=True)
        (assets / "figures/test.png").write_bytes(b"cached fixture")
        (assets / "figure-index.json").write_text(
            json.dumps({"figures": {"test#1": {"file": "figures/test.png"}}}), encoding="utf-8"
        )
        with (
            mock.patch.object(figures, "ASSETS", assets),
            mock.patch.object(figures, "usage", return_value={"test#1": 1}) as usage,
            mock.patch.object(figures, "fetch", side_effect=AssertionError("network")),
        ):
            result = figures.resolve("test#1", "b" * 64)
        self.assertEqual(result["status"], "ready")
        usage.assert_called_once_with("b" * 64)

    def test_unknown_reference_never_downloads(self):
        with (
            mock.patch.object(figures, "usage", return_value={}),
            mock.patch.object(figures, "fetch", side_effect=AssertionError("network")),
        ):
            result = figures.resolve("unknown")
        self.assertEqual(result["status"], "missing")
        self.assertNotIn("file", result)

    def test_usage_is_read_from_the_requested_snapshot(self):
        (self.root / "figure-usage.json").write_text('{"new-character":2}', encoding="utf-8")
        with mock.patch.object(figures, "dataset_dir", return_value=self.root) as directory:
            self.assertEqual(figures.usage("c" * 64), {"new-character": 2})
        directory.assert_called_once_with("c" * 64)


if __name__ == "__main__":
    main()
