"""Build a source-preserving reading projection from the pinned Release ZIP. No LLM."""

from pathlib import Path
import collections
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
OUT = ROOT / "reader/data"


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def project_line(line, index):
    attrs = line.get("attributes") or {}
    prop = str(line.get("prop") or "")
    lower = prop.lower()
    text = attrs.get("content", attrs.get("text", ""))
    if not isinstance(text, str):
        text = str(text)
    kind = (
        "choice"
        if lower == "decision"
        else "branch"
        if lower == "predicate"
        else "dialogue"
        if lower == "name" and attrs.get("name")
        else "narration"
        if lower == "name"
        else "text"
        if text
        else "command"
    )
    return {
        "index": index,
        "sourceId": line.get("id"),
        "pointer": f"/storyList/{index}",
        "kind": kind,
        "speaker": str(attrs.get("name") or "") if lower == "name" else "",
        "text": text,
        "raw": line,
    }


def build(*, raw=RAW, out=OUT, release_path=None, reports=ROOT / "data/reports"):
    release_path = release_path or (
        raw / "release.json" if (raw / "release.json").exists() else ROOT / "release-latest.json"
    )
    manifest = json.loads((raw / "manifest.json").read_text(encoding="utf-8-sig"))
    archive = raw / "zh_CN.zip"
    actual = digest(archive.read_bytes())
    expected = manifest["assets"]["zh_CN.zip"]
    if actual != expected["sha256"] or archive.stat().st_size != expected["size"]:
        raise ValueError("Release ZIP size or SHA-256 mismatch")
    release = json.loads(release_path.read_text(encoding="utf-8-sig"))
    asset = next(a for a in release["assets"] if a["name"] == "zh_CN.zip")
    if asset.get("digest") and asset["digest"] != "sha256:" + actual:
        raise ValueError("GitHub asset digest mismatch")
    chapters, events, search = [], {}, []
    props, kinds, top_fields, line_fields, attr_fields = [collections.Counter() for _ in range(5)]
    figure_usage = collections.Counter()
    missing, collisions, referenced = [], [], set()
    with zipfile.ZipFile(archive) as z:

        def load(name, default=None):
            full = "zh_CN/" + name
            return json.loads(z.read(full)) if full in z.namelist() else default

        review = load("gamedata/excel/story_review_table.json", {})
        supplement = load("story_supplement.json", {})
        summaries = load("summaries.json", {})
        event_summaries = load("event_summaries.json", {})
        refs = {}
        for eid, event in review.items():
            events[eid] = {
                "id": eid,
                "name": event["name"],
                "type": event["entryType"],
                "startTime": event.get("startTime"),
                "raw": event,
                "summary": event_summaries.get(eid),
            }
            for ch in event.get("infoUnlockDatas", []):
                key = ch.get("storyTxt", "").casefold()
                if key:
                    refs.setdefault(key, []).append(
                        {
                            "eventId": eid,
                            "sort": ch.get("storySort"),
                            "origin": "story_review_table",
                            "raw": ch,
                        }
                    )
        for event in supplement.get("events", []):
            eid = event["event_id"]
            events[eid] = {
                "id": eid,
                "name": event["name"],
                "type": event["entry_type"],
                "startTime": None,
                "raw": event,
                "summary": event_summaries.get(eid),
            }
            for ch in event["chapters"]:
                refs.setdefault(ch["key"].casefold(), []).append(
                    {"eventId": eid, "sort": ch["sort"], "origin": "story_supplement", "raw": ch}
                )
        paths = sorted(n for n in z.namelist() if "/gamedata/story/" in n and n.endswith(".json"))
        excluded = []
        seen = set()
        for path in paths:
            payload = z.read(path)
            doc = json.loads(payload)
            if not isinstance(doc, dict) or not isinstance(doc.get("storyList"), list):
                excluded.append(path)
                continue
            key = path.split("/gamedata/story/", 1)[1][:-5]
            if key.casefold() in seen:
                collisions.append(key)
            seen.add(key.casefold())
            links = refs.get(key.casefold(), [])
            referenced.add(key.casefold())
            # Hash actual member path, not a guessed semantic identity.
            cid = digest(path.encode())[:24]
            eid = doc.get("eventid") or "extra"
            if eid not in events:
                events[eid] = {
                    "id": eid,
                    "name": doc.get("eventName") or "其他 / 补充剧情",
                    "type": doc.get("entryType") or "EXTRA",
                    "startTime": None,
                    "raw": {},
                    "summary": event_summaries.get(eid),
                }
            lines = [project_line(line, i) for i, line in enumerate(doc["storyList"])]
            info = {
                "id": cid,
                "key": key,
                "eventId": eid,
                "title": doc.get("storyName") or key,
                "code": doc.get("storyCode") or "",
                "tag": doc.get("avgTag") or "",
                "type": doc.get("entryType") or "EXTRA",
                "sort": next((r["sort"] for r in links if r["eventId"] == eid), None),
                "member": path,
                "sha256": digest(payload),
                "refs": links,
                "speakers": sorted({l["speaker"] for l in lines if l["speaker"]}),
                "lineCount": len(lines),
                "textCount": sum(bool(l["text"]) for l in lines),
                "optionTrace": doc.get("OPTIONTRACE"),
                "hasChoices": any(l["kind"] == "choice" for l in lines),
            }
            chapters.append(info)
            summary = summaries.get(key)
            if summary is None:
                summary = next(
                    (v for k, v in summaries.items() if k.casefold() == key.casefold()), None
                )
            dump(
                out / "chapters" / (cid + ".json"),
                {
                    "meta": info,
                    "brief": doc.get("storyInfo") or "",
                    "summary": summary,
                    "lines": lines,
                    "raw": doc,
                },
            )
            top_fields.update(doc.keys())
            for line in lines:
                raw = line["raw"]
                if isinstance(raw.get("figure_art"), str) and raw["figure_art"]:
                    figure_usage[raw["figure_art"]] += 1
                props[str(raw.get("prop"))] += 1
                kinds[line["kind"]] += 1
                line_fields.update(raw.keys())
                attr_fields.update((raw.get("attributes") or {}).keys())
                searchable = line["text"]
                if line["kind"] == "choice":
                    searchable += " " + str((raw.get("attributes") or {}).get("options", ""))
                if searchable:
                    search.append(
                        {
                            "chapter": cid,
                            "index": line["index"],
                            "speaker": line["speaker"],
                            "text": searchable,
                        }
                    )
        missing = [k for k in refs if k not in referenced]
        inventory = {
            "zipMembers": len(z.namelist()),
            "storyJsonMembers": len(paths),
            "excludedStoryJson": excluded,
            "txtMemberPaths": [n for n in z.namelist() if n.endswith(".txt")],
            "txtMembers": sum(n.endswith(".txt") for n in z.namelist()),
            "excelMembers": sum("/excel/" in n for n in z.namelist()),
            "reviewEvents": len(review),
            "supplementEvents": len(supplement.get("events", [])),
            "supplementChapters": sum(len(e["chapters"]) for e in supplement.get("events", [])),
            "unmatchedReferences": missing,
            "caseCollisions": collisions,
            "chapterFields": dict(top_fields),
            "lineFields": dict(line_fields),
            "attributeFields": dict(attr_fields),
            "props": dict(props),
            "kinds": dict(kinds),
            "entryTypes": dict(collections.Counter(c["type"] for c in chapters)),
            "chaptersWithoutCatalogRef": sum(not c["refs"] for c in chapters),
            "optionTraceFalse": sum(c["optionTrace"] is False for c in chapters),
        }
    # Keep only reading identity and release details needed by the application.
    # The raw manifest and release metadata retain full build provenance.
    snapshot = {
        "id": actual,
        "releaseTag": release["tag_name"],
        "releaseUrl": release["html_url"],
        "publishedAt": release["published_at"],
    }
    # Sort only by source-provided order within an event. Unknown sort follows known sort.
    chapters.sort(key=lambda c: (c["eventId"], c["sort"] is None, c["sort"] or 0, c["key"]))
    dump(
        out / "catalog.json",
        {
            "schemaVersion": "source-reader/v1",
            "snapshot": snapshot,
            "events": list(events.values()),
            "chapters": chapters,
            "inventory": inventory,
        },
    )
    dump(out / "search.json", search)
    dump(out / "figure-usage.json", dict(figure_usage))
    dump(reports / "source-inventory.json", inventory)
    dump(reports / "source-lock.json", snapshot)
    result = {
        "chapters": len(chapters),
        "events": len(events),
        "searchableLines": len(search),
        "missingRefs": len(missing),
        "zipVerified": True,
    }
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    build()
