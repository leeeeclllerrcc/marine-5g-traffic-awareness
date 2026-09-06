from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable


def get_json(url: str):
    with urlopen(url, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    proc = subprocess.Popen([PYTHON, str(ROOT / "src" / "server.py")], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        time.sleep(2.5)
        health = get_json("http://127.0.0.1:8765/api/health")
        state = get_json("http://127.0.0.1:8765/api/state?scenario=fleet_gather&step=150")
        assert health["ok"] is True
        assert health["author"] == "非增程式柠檬"
        assert health["authorship"] == "本项目原创内容唯一作者与权利主体：非增程式柠檬"
        assert health["version"] == "0.5"
        assert state["meta"]["grid_count"] == 144
        assert state["meta"]["active_vessels"] == 80
        assert state["recommendation"]["type"] in {"容量保障", "重点巡检", "常态监测"}
        print(json.dumps({"health": health, "state_meta": state["meta"], "recommendation": state["recommendation"]}, ensure_ascii=False, indent=2))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
