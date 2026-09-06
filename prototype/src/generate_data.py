from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path
from typing import Dict, Iterable, List, Tuple


AUTHOR = "非增程式柠檬"
SEED = 20260906
ROWS = 12
COLS = 12
STEPS = 288
VESSELS = 80
TIME_WINDOW_MINUTES = 5
LON_MIN, LON_MAX = 118.0, 120.0
LAT_MIN, LAT_MAX = 24.0, 26.0

BEHAVIOR_LABELS = ("航行", "锚泊", "疑似捕捞", "直播/监控上行")
SCENARIOS = {
    "baseline": "正常基线",
    "fishing_burst": "捕捞热度上升",
    "fleet_gather": "船舶群聚",
    "comms_outage": "通信中断",
    "uplink_surge": "直播上行激增",
}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def grid_id(row: int, col: int) -> str:
    return f"G{row + 1:02d}-{col + 1:02d}"


def normalized_to_geo(x: float, y: float) -> Tuple[float, float]:
    return LON_MIN + x * (LON_MAX - LON_MIN), LAT_MIN + y * (LAT_MAX - LAT_MIN)


def geo_to_grid(lon: float, lat: float) -> Tuple[int, int]:
    col = int(clamp((lon - LON_MIN) / (LON_MAX - LON_MIN) * COLS, 0, COLS - 1))
    row = int(clamp((lat - LAT_MIN) / (LAT_MAX - LAT_MIN) * ROWS, 0, ROWS - 1))
    return row, col


def scenario_config(scenario: str) -> Dict[str, object]:
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario}")
    return {"name": scenario, "label": SCENARIOS[scenario]}


def _base_vessels(rng: random.Random) -> List[Dict[str, object]]:
    vessels = []
    weights = [("航行", 0.35), ("锚泊", 0.15), ("疑似捕捞", 0.32), ("直播/监控上行", 0.18)]
    population = [item[0] for item in weights for _ in range(max(1, int(item[1] * VESSELS)))]
    while len(population) < VESSELS:
        population.append("航行")
    rng.shuffle(population)
    for idx in range(VESSELS):
        behavior = population[idx]
        if behavior == "直播/监控上行":
            x = rng.uniform(0.08, 0.38)
            y = rng.uniform(0.10, 0.50)
        elif behavior == "锚泊":
            x = rng.uniform(0.35, 0.70)
            y = rng.uniform(0.30, 0.68)
        else:
            x = rng.uniform(0.08, 0.92)
            y = rng.uniform(0.10, 0.90)
        vessels.append({
            "vessel_id": f"V-{idx + 1:03d}",
            "truth_behavior": behavior,
            "x0": x,
            "y0": y,
            "phase": rng.uniform(0, math.tau),
            "heading": rng.uniform(0, math.tau),
            "speed_factor": rng.uniform(0.75, 1.25),
        })
    return vessels


def _move_vessel(meta: Dict[str, object], step: int, scenario: str) -> Dict[str, float]:
    behavior = str(meta["truth_behavior"])
    phase = float(meta["phase"])
    x0 = float(meta["x0"])
    y0 = float(meta["y0"])
    speed_factor = float(meta["speed_factor"])
    t = step / 18.0
    x, y, sog, cog, turn_rate = x0, y0, 0.0, 0.0, 0.0

    if behavior == "航行":
        angle = float(meta["heading"]) + 0.20 * math.sin(t / 2 + phase)
        sog = 7.5 * speed_factor + 0.8 * math.sin(t + phase)
        x = x0 + 0.16 * math.cos(angle) * math.sin(t / 3 + phase)
        y = y0 + 0.16 * math.sin(angle) * math.sin(t / 3 + phase)
        cog = math.degrees(angle) % 360
        turn_rate = 0.06 + 0.03 * abs(math.sin(t + phase))
    elif behavior == "锚泊":
        x = x0 + 0.010 * math.sin(t * 1.8 + phase)
        y = y0 + 0.010 * math.cos(t * 1.4 + phase)
        sog = 0.25 + 0.18 * abs(math.sin(t + phase))
        cog = math.degrees(float(meta["heading"])) % 360
        turn_rate = 0.08
    elif behavior == "疑似捕捞":
        theta = t * (0.80 + 0.12 * speed_factor) + phase
        x = x0 + 0.060 * math.sin(theta) + 0.018 * math.sin(theta * 3)
        y = y0 + 0.045 * math.sin(theta * 0.72 + phase) + 0.012 * math.cos(theta * 2)
        sog = 1.8 + 0.9 * abs(math.sin(theta * 1.7))
        cog = (math.degrees(math.atan2(math.cos(theta), math.cos(theta * 0.72))) + 360) % 360
        turn_rate = 0.42 + 0.24 * abs(math.sin(theta))
    else:
        x = x0 + 0.018 * math.sin(t * 0.6 + phase)
        y = y0 + 0.018 * math.cos(t * 0.5 + phase)
        sog = 0.45 + 0.25 * abs(math.sin(t + phase))
        cog = math.degrees(float(meta["heading"])) % 360
        turn_rate = 0.12

    if scenario == "fleet_gather" and 120 <= step <= 180 and behavior in {"航行", "疑似捕捞"}:
        progress = (step - 120) / 60.0
        x = x * (1 - 0.55 * progress) + 0.58 * (0.55 * progress)
        y = y * (1 - 0.55 * progress) + 0.55 * (0.55 * progress)
        sog *= 0.72
        turn_rate += 0.08

    return {
        "x": clamp(x, 0.02, 0.98),
        "y": clamp(y, 0.02, 0.98),
        "sog": max(0.0, sog),
        "cog": cog,
        "turn_rate": turn_rate,
    }


def _traffic(meta: Dict[str, object], step: int, scenario: str, rng: random.Random) -> Dict[str, float]:
    behavior = str(meta["truth_behavior"])
    if behavior == "航行":
        up, down = 0.75e6, 3.80e6
    elif behavior == "锚泊":
        up, down = 0.45e6, 1.55e6
    elif behavior == "疑似捕捞":
        up, down = 1.65e6, 2.15e6
    else:
        up, down = 8.40e6, 2.65e6

    wave = 1.0 + 0.13 * math.sin(step / 10 + float(meta["phase"]))
    noise = rng.uniform(0.88, 1.14)
    up *= wave * noise
    down *= wave * rng.uniform(0.90, 1.12)
    event_truth = ""

    if scenario == "fishing_burst" and 145 <= step <= 190 and behavior == "疑似捕捞":
        up *= 1.35
        down *= 1.28
        event_truth = "捕捞热度上升"
    elif scenario == "fleet_gather" and 120 <= step <= 180:
        up *= 1.15
        down *= 1.22
        event_truth = "船舶群聚"
    elif scenario == "comms_outage" and 168 <= step <= 192:
        up *= 0.22
        down *= 0.18
        event_truth = "通信中断"
    elif scenario == "uplink_surge" and 100 <= step <= 132 and behavior == "直播/监控上行":
        up *= 3.8
        event_truth = "直播上行激增"

    return {
        "up_bytes": max(0.0, up),
        "down_bytes": max(0.0, down),
        "active_devices": 1 + (1 if behavior in {"疑似捕捞", "直播/监控上行"} else 0),
        "event_truth": event_truth,
    }


def generate_records(scenario: str = "baseline", seed: int = SEED, steps: int = STEPS) -> Tuple[List[Dict[str, object]], List[Dict[str, object]]]:
    scenario_config(scenario)
    # All scenarios share the same deterministic base population and noise
    # sequence. Only the declared event injection differs, which makes the
    # scenario-vs-baseline comparison auditable rather than a seed artifact.
    rng = random.Random(seed)
    metas = _base_vessels(rng)
    vessel_records: List[Dict[str, object]] = []
    grid_acc: Dict[Tuple[int, int, int], Dict[str, object]] = {}

    for step in range(steps):
        timestamp = f"2026-09-06T{(step * TIME_WINDOW_MINUTES) // 60:02d}:{(step * TIME_WINDOW_MINUTES) % 60:02d}:00"
        for meta in metas:
            motion = _move_vessel(meta, step, scenario)
            traffic = _traffic(meta, step, scenario, rng)
            lon, lat = normalized_to_geo(motion["x"], motion["y"])
            row, col = geo_to_grid(lon, lat)
            key = (step, row, col)
            acc = grid_acc.setdefault(key, {
                "step": step,
                "timestamp": timestamp,
                "grid_id": grid_id(row, col),
                "row": row,
                "col": col,
                "up_bytes": 0.0,
                "down_bytes": 0.0,
                "active_devices": 0,
                "vessel_count": 0,
                "fishing_count": 0,
                "streaming_count": 0,
                "event_truth": "",
            })
            acc["up_bytes"] += traffic["up_bytes"]
            acc["down_bytes"] += traffic["down_bytes"]
            acc["active_devices"] += int(traffic["active_devices"])
            acc["vessel_count"] += 1
            if meta["truth_behavior"] == "疑似捕捞":
                acc["fishing_count"] += 1
            if meta["truth_behavior"] == "直播/监控上行":
                acc["streaming_count"] += 1
            if traffic["event_truth"]:
                acc["event_truth"] = traffic["event_truth"]

            signal = -68.0 - 22.0 * abs(motion["y"] - 0.52) - 8.0 * abs(motion["x"] - 0.50) + rng.uniform(-3, 3)
            vessel_records.append({
                "step": step,
                "timestamp": timestamp,
                "vessel_id": meta["vessel_id"],
                "lon": round(lon, 6),
                "lat": round(lat, 6),
                "grid_id": grid_id(row, col),
                "row": row,
                "col": col,
                "sog": round(motion["sog"], 3),
                "cog": round(motion["cog"], 2),
                "turn_rate": round(motion["turn_rate"], 3),
                "up_bytes": round(traffic["up_bytes"], 2),
                "down_bytes": round(traffic["down_bytes"], 2),
                "active_devices": int(traffic["active_devices"]),
                "signal_dbm": round(signal, 2),
                "truth_behavior": meta["truth_behavior"],
                "event_truth": traffic["event_truth"],
            })

    grid_records: List[Dict[str, object]] = []
    for step in range(steps):
        for row in range(ROWS):
            for col in range(COLS):
                item = grid_acc.get((step, row, col), {
                    "step": step,
                    "timestamp": f"2026-09-06T{(step * TIME_WINDOW_MINUTES) // 60:02d}:{(step * TIME_WINDOW_MINUTES) % 60:02d}:00",
                    "grid_id": grid_id(row, col),
                    "row": row,
                    "col": col,
                    "up_bytes": 0.0,
                    "down_bytes": 0.0,
                    "active_devices": 0,
                    "vessel_count": 0,
                    "fishing_count": 0,
                    "streaming_count": 0,
                    "event_truth": "",
                })
                item["prb_load"] = round(clamp((float(item["up_bytes"]) + float(item["down_bytes"])) / 22e6 * 100, 0, 100), 2)
                item["total_bytes"] = round(float(item["up_bytes"]) + float(item["down_bytes"]), 2)
                item["demand_truth"] = round(
                    0.48 * math.log1p(float(item["total_bytes"]) / 1e6) +
                    0.26 * min(1.0, int(item["active_devices"]) / 12.0) +
                    0.18 * min(1.0, float(item["vessel_count"]) / 8.0) +
                    0.08 * min(1.0, float(item["prb_load"]) / 100.0), 4
                )
                # Keep ground-truth events semantically sparse: only cells
                # where the injected pattern is observable are labeled.
                if scenario == "fishing_burst" and not (145 <= step <= 190 and int(item["fishing_count"]) >= 1):
                    item["event_truth"] = ""
                if scenario == "fleet_gather" and not (120 <= step <= 180 and int(item["vessel_count"]) >= 5):
                    item["event_truth"] = ""
                if scenario == "uplink_surge" and not (100 <= step <= 132 and int(item["streaming_count"]) >= 1):
                    item["event_truth"] = ""
                grid_records.append(item)
    return vessel_records, grid_records


def write_dataset(output_dir: Path, scenario: str = "baseline", seed: int = SEED, steps: int = STEPS) -> Dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    vessels, grids = generate_records(scenario, seed, steps)
    vessel_path = output_dir / f"{scenario}_vessels.json"
    grid_path = output_dir / f"{scenario}_grid.json"
    vessel_path.write_text(json.dumps(vessels, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    grid_path.write_text(json.dumps(grids, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return {"vessels": str(vessel_path), "grid": str(grid_path)}


def main() -> None:
    parser = argparse.ArgumentParser(description="生成海域5G流量与船舶轨迹仿真数据")
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), default="baseline")
    parser.add_argument("--output", default=str(Path(__file__).resolve().parents[1] / "data"))
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--steps", type=int, default=STEPS)
    args = parser.parse_args()
    print(json.dumps(write_dataset(Path(args.output), args.scenario, args.seed, args.steps), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
