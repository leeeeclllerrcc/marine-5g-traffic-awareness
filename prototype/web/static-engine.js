(function () {
  "use strict";

  const SCENARIOS = {
    baseline: "正常基线",
    fishing_burst: "捕捞热度上升",
    fleet_gather: "船舶群聚",
    comms_outage: "通信中断",
    uplink_surge: "直播上行激增"
  };

  const COLORS = {
    "高热度": "#ff6b5f",
    "中热度": "#ffb35c",
    "低热度": "#2f8fb3",
    "非热点": "#24405e"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash(seed) {
    let value = 2166136261;
    const text = String(seed);
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    value += value << 13;
    value ^= value >>> 7;
    value += value << 3;
    value ^= value >>> 17;
    value += value << 5;
    return (value >>> 0) / 4294967296;
  }

  function wave(step, phase, period) {
    return (Math.sin((step + phase) * Math.PI * 2 / period) + 1) / 2;
  }

  function gaussian(col, row, centerCol, centerRow, spread) {
    const distance = (col - centerCol) ** 2 + (row - centerRow) ** 2;
    return Math.exp(-distance / spread);
  }

  function gridId(row, col) {
    return `G${String(row + 1).padStart(2, "0")}-${String(col + 1).padStart(2, "0")}`;
  }

  function timeLabel(step) {
    const normalized = ((step % 288) + 288) % 288;
    const minutes = normalized * 5;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function scenarioProfile(scenario) {
    const profiles = {
      baseline: { center: [6.2, 5.4], intensity: 0.15, vesselBoost: 0, upBoost: 1, downBoost: 1 },
      fishing_burst: { center: [8.2, 6.4], intensity: 1.1, vesselBoost: 15, upBoost: 1.22, downBoost: 1.12 },
      fleet_gather: { center: [4.2, 7.8], intensity: 1.25, vesselBoost: 22, upBoost: 1.15, downBoost: 1.18 },
      comms_outage: { center: [7.4, 4.3], intensity: 1.05, vesselBoost: 10, upBoost: 0.28, downBoost: 0.2 },
      uplink_surge: { center: [8.4, 8.1], intensity: 1.2, vesselBoost: 12, upBoost: 2.8, downBoost: 1.08 }
    };
    return profiles[scenario] || profiles.baseline;
  }

  function buildVessels(scenario, step, profile) {
    const activeFactor = 0.72 + wave(step, -56, 288) * 0.34;
    const count = Math.round((52 + profile.vesselBoost) * activeFactor);
    const vessels = [];
    const tracks = {};
    const eventStrength = clamp((wave(step, -148, 288) - 0.38) * 1.8, 0, 1);

    for (let index = 0; index < count; index += 1) {
      const clustered = scenario !== "baseline" && hash(`${scenario}-cluster-${index}`) < 0.42 + eventStrength * 0.25;
      const baseLon = clustered
        ? 118 + (profile.center[0] + (hash(`${scenario}-cx-${index}`) - 0.5) * 3.2) / 6
        : 118.08 + hash(`${scenario}-lon-${index}`) * 1.84;
      const baseLat = clustered
        ? 24 + (profile.center[1] + (hash(`${scenario}-cy-${index}`) - 0.5) * 3.2) / 6
        : 24.08 + hash(`${scenario}-lat-${index}`) * 1.84;
      const phase = hash(`${scenario}-phase-${index}`) * Math.PI * 2;
      const drift = (step - 144) / 288;
      const lon = clamp(baseLon + Math.cos(phase + step / 28) * 0.035 + drift * (hash(`dx-${index}`) - 0.5) * 0.18, 118.02, 119.98);
      const lat = clamp(baseLat + Math.sin(phase + step / 31) * 0.035 + drift * (hash(`dy-${index}`) - 0.5) * 0.18, 24.02, 25.98);
      const col = clamp(Math.floor((lon - 118) / 2 * 12), 0, 11);
      const row = clamp(Math.floor((lat - 24) / 2 * 12), 0, 11);
      const id = `V-${String(index + 1).padStart(3, "0")}`;
      const nearEvent = gaussian(col, row, profile.center[0], profile.center[1], 8) > 0.45;
      let behavior = hash(`behavior-${index}`) < 0.24 ? "锚泊" : "航行";
      let sog = behavior === "锚泊" ? 0.2 + hash(`sog-${index}`) * 0.7 : 4.8 + hash(`sog-${index}`) * 8.2;
      let upMb = 0.35 + hash(`up-${index}-${step}`) * 2.2;
      let downMb = 0.8 + hash(`down-${index}-${step}`) * 4.5;
      let alert = false;

      if (scenario === "fishing_burst" && nearEvent && clustered) {
        behavior = "疑似捕捞";
        sog = 0.8 + hash(`fish-sog-${index}`) * 2.4;
        upMb *= 1.7;
        downMb *= 1.25;
        alert = true;
      } else if (scenario === "uplink_surge" && nearEvent && clustered) {
        behavior = "直播/监控上行";
        upMb *= 5.5;
        alert = true;
      } else if (scenario === "fleet_gather" && nearEvent && clustered) {
        upMb *= 1.6;
        downMb *= 1.7;
        alert = true;
      } else if (scenario === "comms_outage" && nearEvent) {
        upMb *= 0.12;
        downMb *= 0.08;
        alert = true;
      }

      upMb *= profile.upBoost;
      downMb *= profile.downBoost;
      const vessel = {
        vessel_id: id,
        lon,
        lat,
        row,
        col,
        grid_id: gridId(row, col),
        sog,
        cog: hash(`cog-${index}-${step}`) * 360,
        up_mb: upMb,
        down_mb: downMb,
        signal_dbm: -62 - hash(`signal-${index}-${step}`) * 35,
        behavior,
        confidence: 0.76 + hash(`confidence-${scenario}-${index}`) * 0.2,
        alert
      };
      vessels.push(vessel);

      const points = [];
      for (let history = 8; history >= 0; history -= 1) {
        const offset = history * 0.0065;
        points.push({
          lon: clamp(lon - Math.cos(phase) * offset, 118.02, 119.98),
          lat: clamp(lat - Math.sin(phase) * offset, 24.02, 25.98)
        });
      }
      tracks[id] = points;
    }
    return { vessels, tracks };
  }

  function heatLevel(score) {
    if (score >= 72) return "高热度";
    if (score >= 48) return "中热度";
    if (score >= 25) return "低热度";
    return "非热点";
  }

  function alertForCell(scenario, cell, eventImpact) {
    if (eventImpact < 0.5 || scenario === "baseline") return null;
    const evidenceBase = `${cell.vessel_count}艘船 / 负载${cell.prb_load.toFixed(0)}%`;
    if (scenario === "fishing_burst" && cell.vessel_count >= 2) {
      return { type: "捕捞活动增强", level: cell.prb_load > 72 ? "高" : "中", evidence: `低速转向船舶聚集 / ${evidenceBase}` };
    }
    if (scenario === "fleet_gather" && cell.vessel_count >= 3) {
      return { type: "船舶群聚与容量压力", level: cell.vessel_count >= 6 ? "高" : "中", evidence: `轨迹密度高于基线 / ${evidenceBase}` };
    }
    if (scenario === "comms_outage" && cell.vessel_count >= 1) {
      return { type: "流量—轨迹背离", level: "高", evidence: `有轨迹但通信量骤降 / ${cell.vessel_count}艘船` };
    }
    if (scenario === "uplink_surge" && cell.up_mb > cell.down_mb * 1.15) {
      return { type: "上行流量突增", level: cell.prb_load > 75 ? "高" : "中", evidence: `上行占比异常 / ${evidenceBase}` };
    }
    return null;
  }

  function buildGrid(scenario, step, profile, vessels) {
    const byGrid = new Map();
    vessels.forEach((vessel) => {
      if (!byGrid.has(vessel.grid_id)) byGrid.set(vessel.grid_id, []);
      byGrid.get(vessel.grid_id).push(vessel);
    });
    const daytime = 0.55 + wave(step, -62, 288) * 0.55;
    const eventStrength = scenario === "baseline" ? 0 : clamp((wave(step, -148, 288) - 0.3) * 1.55, 0.18, 1);
    const cells = [];

    for (let row = 0; row < 12; row += 1) {
      for (let col = 0; col < 12; col += 1) {
        const id = gridId(row, col);
        const occupants = byGrid.get(id) || [];
        const coastDemand = gaussian(col, row, 2.2, 3.1, 13) + gaussian(col, row, 9.2, 8.5, 12);
        const eventImpact = gaussian(col, row, profile.center[0], profile.center[1], 7.5) * profile.intensity * eventStrength;
        const deviceBase = Math.round((2 + coastDemand * 13 + eventImpact * 18 + occupants.length * 2.8) * daytime);
        let upMb = deviceBase * (0.6 + hash(`${id}-up-${step}`) * 0.35) + occupants.reduce((sum, item) => sum + item.up_mb, 0);
        let downMb = deviceBase * (1.15 + hash(`${id}-down-${step}`) * 0.65) + occupants.reduce((sum, item) => sum + item.down_mb, 0);

        if (scenario === "comms_outage" && eventImpact > 0.48) {
          upMb *= 0.09;
          downMb *= 0.06;
        } else if (scenario === "uplink_surge" && eventImpact > 0.42) {
          upMb *= 2.5;
        }

        const totalMb = upMb + downMb;
        const load = clamp(totalMb * 1.18 + occupants.length * 3.2, 0, 99);
        const heatScore = clamp(load * 0.72 + occupants.length * 4.2 + eventImpact * 24, 0, 100);
        const level = heatLevel(heatScore);
        const cell = {
          grid_id: id,
          row,
          col,
          heat_level: level,
          heat_color: COLORS[level],
          heat_score: heatScore,
          up_mb: upMb,
          down_mb: downMb,
          total_mb: totalMb,
          active_devices: deviceBase + occupants.length,
          vessel_count: occupants.length,
          prb_load: load,
          anomaly_score: eventImpact * 100,
          alert: false,
          alert_type: ""
        };
        const alert = alertForCell(scenario, cell, eventImpact);
        if (alert) {
          cell.alert = true;
          cell.alert_type = alert.type;
          cell.alert_level = alert.level;
          cell.alert_evidence = alert.evidence;
        }
        cells.push(cell);
      }
    }
    return cells;
  }

  function buildTrend(scenario, step, profile) {
    const points = [];
    for (let offset = 23; offset >= 0; offset -= 1) {
      const trendStep = ((step - offset) % 288 + 288) % 288;
      const daily = 0.58 + wave(trendStep, -60, 288) * 0.52;
      const event = scenario === "baseline" ? 0 : clamp((wave(trendStep, -148, 288) - 0.34) * 1.7, 0, 1);
      const noise = 0.94 + hash(`${scenario}-trend-${trendStep}`) * 0.12;
      let up = (115 * daily + event * 70 * profile.intensity) * noise * profile.upBoost;
      let down = (185 * daily + event * 82 * profile.intensity) * noise * profile.downBoost;
      if (scenario === "comms_outage" && event > 0.55) {
        up *= 0.32;
        down *= 0.22;
      }
      points.push({
        step: trendStep,
        label: timeLabel(trendStep),
        up_mb: up,
        down_mb: down,
        active: Math.round(56 * daily + event * profile.vesselBoost),
        load: clamp((up + down) / 6.1, 4, 96)
      });
    }
    return points;
  }

  function recommendationFor(scenario, alerts) {
    const firstGrid = alerts[0]?.grid_id || "G06-06";
    const recommendations = {
      baseline: { type: "持续监测", text: "当前海域运行平稳，建议保持滚动基线并关注午后业务峰值。", grid_id: firstGrid },
      fishing_burst: { type: "重点保障", text: "建议联动轨迹核验捕捞热点，并预留重点网格上下行资源。", grid_id: firstGrid },
      fleet_gather: { type: "容量分流", text: "建议启动邻区分流与临时扩容评估，避免船舶群聚引发局部拥塞。", grid_id: firstGrid },
      comms_outage: { type: "故障核查", text: "建议优先核查覆盖、传输与站点告警，确认轨迹存在但流量缺失的原因。", grid_id: firstGrid },
      uplink_surge: { type: "上行保障", text: "建议提高上行资源权重并识别直播或监控业务，保障关键回传。", grid_id: firstGrid }
    };
    return recommendations[scenario] || recommendations.baseline;
  }

  function buildState(scenario, requestedStep) {
    const key = SCENARIOS[scenario] ? scenario : "baseline";
    const step = clamp(Number(requestedStep) || 0, 0, 287);
    const profile = scenarioProfile(key);
    const vesselState = buildVessels(key, step, profile);
    const grid = buildGrid(key, step, profile, vesselState.vessels);
    const alerts = grid
      .filter((cell) => cell.alert)
      .sort((left, right) => right.anomaly_score - left.anomaly_score)
      .slice(0, 12)
      .map((cell) => ({
        grid_id: cell.grid_id,
        timestamp: `2026-09-06T${timeLabel(step)}:00`,
        type: cell.alert_type,
        level: cell.alert_level,
        confidence: clamp(0.72 + cell.anomaly_score / 500, 0.72, 0.94),
        evidence: cell.alert_evidence
      }));
    const totalUp = grid.reduce((sum, cell) => sum + cell.up_mb, 0);
    const totalDown = grid.reduce((sum, cell) => sum + cell.down_mb, 0);
    const behaviorCounts = vesselState.vessels.reduce((counts, vessel) => {
      counts[vessel.behavior] = (counts[vessel.behavior] || 0) + 1;
      return counts;
    }, {});

    return {
      meta: {
        author: "非增程式柠檬",
        step,
        timestamp: `2026-09-06 ${timeLabel(step)}`,
        grid_count: 144,
        active_vessels: vesselState.vessels.length,
        hotspots: grid.filter((cell) => cell.heat_level === "高热度").length,
        total_up_mb: totalUp,
        total_down_mb: totalDown,
        alert_count: alerts.length
      },
      grid,
      vessels: vesselState.vessels,
      tracks: vesselState.tracks,
      alerts,
      behavior_counts: behaviorCounts,
      trend: buildTrend(key, step, profile),
      recommendation: recommendationFor(key, alerts),
      scenario: { key, label: SCENARIOS[key] },
      metrics: { online_demo: true, deterministic: true, author: "非增程式柠檬" }
    };
  }

  window.Marine5GStatic = Object.freeze({ buildState, scenarios: Object.freeze({ ...SCENARIOS }) });
}());
