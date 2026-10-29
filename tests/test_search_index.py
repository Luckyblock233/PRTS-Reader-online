from pathlib import Path
import sys
from unittest import TestCase, main

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from search_index import SearchIndex, SearchError


class CorpusSearchTests(TestCase):
    def setUp(self):
        catalog = {
            "events": [{"id": "event", "name": "测试活动"}],
            "chapters": [
                {
                    "id": "a",
                    "title": "第一篇",
                    "code": "T-1",
                    "tag": "行动前",
                    "eventId": "event",
                    "member": "a.json",
                },
                {
                    "id": "b",
                    "title": "第二篇",
                    "code": "T-2",
                    "tag": "行动后",
                    "eventId": "event",
                    "member": "b.json",
                },
            ],
        }
        records = [
            {"chapter": "a", "index": 0, "speaker": "阿米娅", "text": "罗德岛，罗德岛。"},
            {"chapter": "a", "index": 2, "speaker": "医疗干员", "text": "博士在罗德岛。"},
            {"chapter": "b", "index": 1, "speaker": "罗德岛干员", "text": "我们出发。"},
            {"chapter": "b", "index": 3, "speaker": "阿米娅", "text": "PRTS online"},
        ]
        docs = {
            "a": {
                "lines": [
                    {"sourceId": 100 + i, "pointer": f"/storyList/{i}", "kind": "dialogue"}
                    for i in range(4)
                ]
            },
            "b": {
                "lines": [
                    {"sourceId": 200 + i, "pointer": f"/storyList/{i}", "kind": "dialogue"}
                    for i in range(4)
                ]
            },
        }
        self.index = SearchIndex(catalog, records, docs.__getitem__)

    def test_all_chapters_and_counts_with_one_record_per_match(self):
        result = self.index.query("罗德岛", page_size=1)
        self.assertEqual(result["globalTotal"], 3)
        self.assertEqual(result["chapterCount"], 2)
        self.assertEqual([c["count"] for c in result["chapters"]], [2, 1])
        self.assertEqual(result["pages"], 3)

    def test_all_pages_expose_every_hit_and_source_id_is_not_index(self):
        results = [self.index.query("罗德岛", page=p, page_size=1)["results"][0] for p in (1, 2, 3)]
        self.assertEqual(
            [(r["chapter"], r["index"]) for r in results], [("a", 0), ("a", 2), ("b", 1)]
        )
        self.assertEqual(results[1]["sourceId"], 102)
        self.assertEqual(results[1]["pointer"], "/storyList/2")
        self.assertEqual(results[1]["title"], "第一篇")

    def test_chapter_filter_keeps_global_discovery_counts(self):
        result = self.index.query("罗德岛", chapter="b")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["globalTotal"], 3)
        self.assertEqual(result["chapterCount"], 2)
        self.assertEqual(result["results"][0]["member"], "b.json")

    def test_single_character_case_insensitivity_and_fields(self):
        self.assertEqual(self.index.query("岛")["total"], 3)
        self.assertEqual(self.index.query("prts")["total"], 1)
        self.assertEqual(self.index.query("罗德岛", field="text")["total"], 2)
        self.assertEqual(self.index.query("罗德岛", field="speaker")["total"], 1)

    def test_empty_result_and_page_clamping(self):
        result = self.index.query("没有这个词", page=999)
        self.assertEqual(
            (result["total"], result["page"], result["pages"], result["start"], result["end"]),
            (0, 1, 1, 0, 0),
        )
        self.assertEqual(self.index.query("罗德岛", page=999, page_size=1)["page"], 3)

    def test_invalid_parameters_are_rejected(self):
        for kwargs in (
            {"query": ""},
            {"query": " "},
            {"query": "词", "page": 0},
            {"query": "词", "page_size": 101},
            {"query": "词", "chapter": "missing"},
            {"query": "词", "field": "bad"},
        ):
            with self.assertRaises(SearchError):
                self.index.query(**kwargs)


class ContextTests(TestCase):
    def setUp(self):
        self.doc = {"lines": []}
        for i in range(9):
            kind = "command" if i in (0, 2, 6, 8) else "dialogue"
            self.doc["lines"].append(
                {
                    "index": i,
                    "sourceId": 100 + i,
                    "pointer": f"/storyList/{i}",
                    "kind": kind,
                    "speaker": "阿米娅" if kind == "dialogue" else "",
                    "text": f"原文 {i}" if kind == "dialogue" else "",
                    "raw": {"attributes": {}},
                }
            )
        self.doc["lines"][4].update(
            kind="branch", speaker="", text="", raw={"attributes": {"references": "1;2"}}
        )
        catalog = {"events": [], "chapters": [{"id": "a", "title": "测试篇", "member": "a.json"}]}
        self.index = SearchIndex(catalog, [], lambda cid: self.doc)

    def test_context_skips_staging_preserves_order_and_branches(self):
        result = self.index.context("a", 3, 2)
        self.assertEqual([l["index"] for l in result["lines"]], [1, 3, 4, 5])
        self.assertEqual((result["beforeCount"], result["afterCount"]), (1, 2))
        self.assertEqual(result["lines"][1]["sourceId"], 103)
        self.assertEqual(result["lines"][2]["kind"], "branch")
        self.assertIn("1;2", result["lines"][2]["text"])
        self.assertTrue(result["hasLater"])

    def test_context_stops_at_chapter_bounds_and_expands(self):
        first = self.index.context("a", 1, 3)
        self.assertEqual(first["beforeCount"], 0)
        self.assertFalse(first["hasEarlier"])
        expanded = self.index.context("a", 3, 20)
        self.assertEqual([l["index"] for l in expanded["lines"]], [1, 3, 4, 5, 7])
        self.assertFalse(expanded["hasLater"])

    def test_requested_command_is_still_locatable(self):
        result = self.index.context("a", 2, 1)
        self.assertIn(2, [l["index"] for l in result["lines"]])

    def test_context_rejects_invalid_chapters_indices_and_radius(self):
        for args in [
            ("missing", 3, 3),
            ("a", -1, 3),
            ("a", 9, 3),
            ("a", 3, 0),
            ("a", 3, 21),
            ("a", True, 3),
        ]:
            with self.assertRaises(SearchError):
                self.index.context(*args)


if __name__ == "__main__":
    main()
