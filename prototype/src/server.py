from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze import build_state, evaluate  # noqa: E402
from generate_data import SCENARIOS, STEPS, generate_records  # noqa: E402


class Engine:
    def __init__(self):
        self.datasets = {}
        baseline_vessels, baseline_grids = generate_records("baseline")
        self.datasets["baseline"] = (baseline_vessels, baseline_grids)
        for scenario in SCENARIOS:
            if scenario == "baseline":
                continue
            self.datasets[scenario] = generate_records(scenario)
        self.metrics = evaluate(*self.datasets["fishing_burst"], self.datasets["baseline"][1])

    def state(self, scenario: str, step: int):
        if scenario not in self.datasets:
            scenario = "baseline"
        step = max(0, min(STEPS - 1, int(step)))
        vessels, grids = self.datasets[scenario]
        baseline_grids = self.datasets["baseline"][1]
        result = build_state(vessels, grids, step, baseline_grids if scenario != "baseline" else grids)
        result["scenario"] = {"key": scenario, "label": SCENARIOS[scenario]}
        result["metrics"] = self.metrics
        return result


ENGINE = Engine()


class Handler(BaseHTTPRequestHandler):
    server_version = "Marine5GOps/0.5"

    def _send(self, content: bytes, content_type: str = "text/html; charset=utf-8", status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send(json.dumps({
                "ok": True,
                "author": "非增程式柠檬",
                "authorship": "本项目原创内容唯一作者与权利主体：非增程式柠檬",
                "version": "0.5",
            }, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            return
        if parsed.path == "/api/state":
            query = parse_qs(parsed.query)
            scenario = query.get("scenario", ["baseline"])[0]
            step = query.get("step", ["0"])[0]
            try:
                data = ENGINE.state(scenario, int(step))
                self._send(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(), "application/json; charset=utf-8")
            except Exception as exc:
                self._send(json.dumps({"error": str(exc)}, ensure_ascii=False).encode(), "application/json; charset=utf-8", 400)
            return
        if parsed.path == "/api/export":
            query = parse_qs(parsed.query)
            scenario = query.get("scenario", ["baseline"])[0]
            step = int(query.get("step", ["0"])[0])
            data = ENGINE.state(scenario, step)
            self._send(json.dumps(data, ensure_ascii=False, indent=2).encode(), "application/json; charset=utf-8")
            return

        path = WEB / ("index.html" if parsed.path in {"/", ""} else parsed.path.lstrip("/"))
        if not path.exists() or not path.is_file() or WEB not in path.parents:
            self._send(b"Not Found", "text/plain; charset=utf-8", 404)
            return
        content_type = "text/plain; charset=utf-8"
        if path.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif path.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        self._send(path.read_bytes(), content_type)

    def log_message(self, fmt, *args):
        print(f"[marine5g] {self.address_string()} - {fmt % args}")


def main():
    host = "127.0.0.1"
    port = 8765
    print(f"Marine 5G Ops Demo | author=非增程式柠檬 | http://{host}:{port}/")
    print("Press Ctrl+C to stop.")
    server = ThreadingHTTPServer((host, port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
