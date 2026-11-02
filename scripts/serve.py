"""Loopback-only static reader + literal full-text search. Python standard library only."""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import argparse
import json
from figures import resolve as resolve_figure
from search_index import search as corpus_search, context as search_context, SearchError
from data_store import descriptor, dataset_dir
from data_updates import MANAGER, UpdateError

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "reader"), **kwargs)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/api/data/status":
            return self.respond(descriptor())
        if url.path == "/api/data/updates":
            return self.respond(MANAGER.status())
        if url.path == "/api/figure":
            try:
                args = parse_qs(url.query)
                return self.respond(
                    resolve_figure(args.get("ref", [""])[0], args.get("snapshot", [""])[0])
                )
            except Exception:
                return self.respond(
                    {
                        "status": "error",
                        "message": "立绘下载暂时不可用，可稍后重试；未使用其他图片替代。",
                    },
                    502,
                )
        if url.path == "/api/search/context":
            try:
                return self.respond(search_context(parse_qs(url.query)))
            except SearchError as e:
                return self.respond({"error": str(e)}, 400)
        if url.path != "/api/search":
            return super().do_GET()
        try:
            return self.respond(corpus_search(parse_qs(url.query)))
        except SearchError as e:
            return self.respond({"error": str(e)}, 400)

    def do_POST(self):
        endpoint = urlsplit(self.path).path
        if endpoint not in ("/api/data/check", "/api/data/install"):
            return self.respond({"error": "未知接口"}, 404)
        # State changes accept same-origin JSON interactions or local HTTP clients.
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if urlsplit("http://" + host).hostname not in ("127.0.0.1", "localhost", "::1"):
            return self.respond({"error": "仅支持本机访问"}, 403)
        if origin and origin != "http://" + host:
            return self.respond({"error": "拒绝跨站写入请求"}, 403)
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.respond({"error": "需要 application/json"}, 415)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 32768:
                return self.respond({"error": "请求大小无效"}, 413)
            args = json.loads(self.rfile.read(size))
            if not isinstance(args, dict):
                return self.respond({"error": "请求必须是 JSON 对象"}, 400)
            if endpoint == "/api/data/check":
                return self.respond(MANAGER.check())
            if endpoint == "/api/data/install":
                return self.respond(MANAGER.start(args.get("token")))
        except UpdateError as e:
            return self.respond({"error": str(e)}, e.status)
        except (ValueError, TypeError):
            return self.respond({"error": "请求或配置格式无效"}, 400)
        except Exception:
            return self.respond({"error": "数据更新请求失败，请检查网络与本地目录权限。"}, 500)

    def respond(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    if not (dataset_dir() / "catalog.json").exists():
        raise SystemExit("No local dataset. Run: python scripts/bootstrap.py")
    print(f"Local: http://127.0.0.1:{args.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
