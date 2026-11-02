"""Local QA fixture: synthetic release and isolated storage, never production data."""

from pathlib import Path
from http.server import ThreadingHTTPServer
import json
import shutil
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from test_data_updates import DataUpdateTests
import serve
import data_store

case = DataUpdateTests()
case.setUp()
root = case.root
try:
    raw = root / "fixture-raw"
    raw.mkdir()
    (raw / "zh_CN.zip").write_bytes(case.content)
    (raw / "manifest.json").write_text(json.dumps(case.manifest), encoding="utf-8")
    release = root / "fixture-release.json"
    release.write_text(json.dumps(case.release), encoding="utf-8")
    case.manager.builder(
        raw=raw, out=root / "reader/data", release_path=release, reports=root / "fixture-reports"
    )
    catalog_path = root / "reader/data/catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    catalog["snapshot"] = {**catalog["snapshot"], **case.old}
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False), encoding="utf-8")
    project = Path(__file__).resolve().parents[1]
    for file in (project / "reader").iterdir():
        if file.is_file():
            shutil.copyfile(file, root / "reader" / file.name)
    fonts = root / "reader/assets/fonts"
    fonts.mkdir(parents=True)
    for file in (project / "reader/assets/fonts").iterdir():
        if file.is_file():
            shutil.copyfile(file, fonts / file.name)
    serve.ROOT = root
    data_store.ROOT = root
    data_store.ACTIVE = root / "data/active-reader.json"
    serve.MANAGER = case.manager
    print("Isolated fixture: http://127.0.0.1:8769", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8769), serve.Handler).serve_forever()
finally:
    if root.resolve().is_relative_to(Path(__file__).resolve().parent):
        case.temp.cleanup()
