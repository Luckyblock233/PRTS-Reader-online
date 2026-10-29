"""Literal corpus search with complete chapter counts and paged source-line locations."""

from collections import Counter
from functools import lru_cache
from pathlib import Path
import json
import threading
from data_store import dataset_dir

ROOT = Path(__file__).resolve().parents[1]
INIT_LOCK = threading.Lock()
INDICES = {}


class SearchError(ValueError):
    pass


class SearchIndex:
    def __init__(self, catalog, records, load_chapter):
        self.chapters = {c["id"]: c for c in catalog["chapters"]}
        self.events = {e["id"]: e["name"] for e in catalog["events"]}
        self.records = records
        self.folded = [(r["text"].casefold(), r["speaker"].casefold()) for r in records]
        self.load_chapter = lru_cache(maxsize=16)(load_chapter)

    @lru_cache(maxsize=4)
    def matches(self, query, field):
        return [
            i
            for i, (text, speaker) in enumerate(self.folded)
            if (field != "speaker" and query in text) or (field != "text" and query in speaker)
        ]

    def context(self, chapter, index, radius=3):
        if chapter not in self.chapters:
            raise SearchError("篇章 ID 无效")
        if type(index) is not int or type(radius) is not int or not 1 <= radius <= 20:
            raise SearchError("段落编号必须是整数，上下文范围应为 1–20 条")
        doc = self.load_chapter(chapter)
        if not 0 <= index < len(doc["lines"]):
            raise SearchError("段落编号超出本篇范围")
        # Keep source order and branch markers; skip empty staging commands.
        readable = [
            line
            for line in doc["lines"]
            if line["text"].strip()
            or line["kind"] in ("choice", "branch")
            or line["index"] == index
        ]
        center = next(i for i, line in enumerate(readable) if line["index"] == index)
        start = max(0, center - radius)
        end = min(len(readable), center + radius + 1)
        lines = []
        for line in readable[start:end]:
            attrs = line["raw"].get("attributes") or {}
            text = line["text"]
            if not text and line["kind"] == "choice":
                text = str(attrs.get("options", ""))
            if not text and line["kind"] == "branch":
                text = "分支引用：" + str(attrs.get("references", "未提供"))
            lines.append(
                {
                    **{k: line[k] for k in ("index", "sourceId", "pointer", "kind", "speaker")},
                    "text": text,
                }
            )
        meta = self.chapters[chapter]
        return {
            "chapter": chapter,
            "title": meta["title"],
            "member": meta["member"],
            "hitIndex": index,
            "radius": radius,
            "beforeCount": center - start,
            "afterCount": end - center - 1,
            "hasEarlier": start > 0,
            "hasLater": end < len(readable),
            "lines": lines,
        }

    def query(self, query, field="all", chapter="", page=1, page_size=50):
        if not isinstance(query, str) or not 1 <= len(query.strip()) <= 100:
            raise SearchError("请输入 1–100 个字符")
        if field not in ("all", "text", "speaker"):
            raise SearchError("检索字段无效")
        if chapter and chapter not in self.chapters:
            raise SearchError("篇章 ID 无效")
        if (
            type(page) is not int
            or page < 1
            or type(page_size) is not int
            or not 1 <= page_size <= 100
        ):
            raise SearchError("页码必须为正整数，每页应为 1–100 条")
        query = query.strip()
        indices = self.matches(query.casefold(), field)
        counts = Counter(self.records[i]["chapter"] for i in indices)
        groups = []
        for cid, count in counts.items():
            meta = self.chapters[cid]
            groups.append(
                {
                    "id": cid,
                    "title": meta["title"],
                    "code": meta["code"],
                    "tag": meta["tag"],
                    "eventId": meta["eventId"],
                    "eventName": self.events.get(meta["eventId"], meta["eventId"]),
                    "count": count,
                }
            )
        visible = [i for i in indices if not chapter or self.records[i]["chapter"] == chapter]
        total = len(visible)
        pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, pages)
        start = (page - 1) * page_size
        results = []
        for i in visible[start : start + page_size]:
            record = self.records[i]
            meta = self.chapters[record["chapter"]]
            line = self.load_chapter(record["chapter"])["lines"][record["index"]]
            results.append(
                {
                    **record,
                    "title": meta["title"],
                    "code": meta["code"],
                    "tag": meta["tag"],
                    "eventName": self.events.get(meta["eventId"], meta["eventId"]),
                    "member": meta["member"],
                    "sourceId": line["sourceId"],
                    "pointer": line["pointer"],
                    "kind": line["kind"],
                }
            )
        return {
            "query": query,
            "field": field,
            "chapter": chapter,
            "total": total,
            "globalTotal": len(indices),
            "chapterCount": len(groups),
            "chapters": groups,
            "page": page,
            "pageSize": page_size,
            "pages": pages,
            "start": start + 1 if total else 0,
            "end": start + len(results),
            "corpusChapters": len(self.chapters),
            "corpusLines": len(self.records),
            "results": results,
        }


def get_index(snapshot=""):
    base = dataset_dir(snapshot)
    with INIT_LOCK:
        if base not in INDICES:

            def read(path):
                return json.loads(path.read_text(encoding="utf-8"))

            INDICES.clear()  # One corpus in memory; in-flight queries keep their own reference.
            INDICES[base] = SearchIndex(
                read(base / "catalog.json"),
                read(base / "search.json"),
                lambda cid: read(base / "chapters" / (cid + ".json")),
            )
        return INDICES[base]


def search(args):
    try:
        page = int(args.get("page", ["1"])[0])
        page_size = int(args.get("page_size", ["50"])[0])
    except (TypeError, ValueError):
        raise SearchError("页码与每页条数必须是整数") from None
    try:
        index = get_index(args.get("snapshot", [""])[0])
    except ValueError as e:
        raise SearchError(str(e)) from None
    return index.query(
        args.get("q", [""])[0],
        args.get("field", ["all"])[0],
        args.get("chapter", [""])[0],
        page,
        page_size,
    )


def context(args):
    try:
        index = int(args.get("index", [""])[0])
        radius = int(args.get("radius", ["3"])[0])
    except (TypeError, ValueError):
        raise SearchError("段落编号与上下文范围必须是整数") from None
    try:
        corpus = get_index(args.get("snapshot", [""])[0])
    except ValueError as e:
        raise SearchError(str(e)) from None
    return corpus.context(args.get("chapter", [""])[0], index, radius)
