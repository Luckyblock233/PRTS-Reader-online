"""Editable landing page content, stored separately from source story data."""

import json
import os
import tempfile
from pathlib import Path

HOME_PATH = Path(__file__).resolve().parents[1] / "config" / "home.json"
DEFAULT_PATH = HOME_PATH.with_name("home.example.json")


class HomeError(ValueError):
    pass


def validate(data):
    if not isinstance(data, dict):
        raise HomeError("首页内容必须是对象")

    def text(value, limit, label):
        if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
            raise HomeError(f"{label}不能为空，且不能超过 {limit} 个字符")
        return value.strip()

    sections = data.get("sections")
    if not isinstance(sections, list) or not 1 <= len(sections) <= 8:
        raise HomeError("首页需包含 1–8 个说明区块")
    result = {
        "title": text(data.get("title"), 100, "首页标题"),
        "intro": text(data.get("intro"), 1500, "首页简介"),
        "sections": [],
    }
    for section in sections:
        if not isinstance(section, dict):
            raise HomeError("说明区块格式无效")
        result["sections"].append(
            {
                "title": text(section.get("title"), 100, "区块标题"),
                "body": text(section.get("body"), 6000, "区块正文"),
            }
        )
    return result


def read_home(path=None):
    target = Path(path) if path is not None else HOME_PATH if HOME_PATH.exists() else DEFAULT_PATH
    return validate(json.loads(target.read_text(encoding="utf-8")))


def save_home(data, path=None):
    path = Path(path) if path is not None else HOME_PATH
    content = validate(data)
    # A failed write must leave the previous homepage intact.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False
        ) as file:
            temporary = Path(file.name)
            json.dump(content, file, ensure_ascii=False, indent=2)
            file.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return content
