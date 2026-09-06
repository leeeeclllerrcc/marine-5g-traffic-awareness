const state = { scenario: "baseline", step: 150, data: null, timer: null, selection: null };
let loadSequence = 0;
const scenarioDescriptions = {
  baseline: "拖动时间轴或切换场景，观察流量与轨迹如何联动。",
  fishing_burst: "低速转向船舶增加，捕捞相关通信需求上升。",
  fleet_gather: "多艘船向局部海域聚集，容量压力与热点扩散同步出现。",
  comms_outage: "局部通信流量骤降，轨迹仍存在，触发联合异常核验。",
  uplink_surge: "直播/监控类船舶上行流量激增，突出上行保障价值。"
};
const behaviorColors = { "航行": "#62d7ef", "锚泊": "#90b2c2", "疑似捕捞": "#ffb35c", "直播/监控上行": "#ff6b5f" };

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const timeLabel = (step) => `${String(Math.floor(step * 5 / 60)).padStart(2, "0")}:${String(step * 5 % 60).padStart(2, "0")}`;

function setRuntimeMode(mode, isOnline) {
  const runtimeMode = $("runtime-mode");
  if (!runtimeMode) return;
  runtimeMode.textContent = mode;
  runtimeMode.className = isOnline ? "runtime-mode online" : "runtime-mode local";
}

function staticState() {
  if (!window.Marine5GStatic) throw new Error("内置演示引擎未加载");
  return window.Marine5GStatic.buildState(state.scenario, state.step);
}

async function loadState() {
  const requestId = ++loadSequence;
  const localApi = ["127.0.0.1", "localhost"].includes(window.location.hostname) && window.location.protocol !== "file:";
  let data;
  let usedApi = false;

  if (localApi) {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1800);
      const response = await fetch(`./api/state?scenario=${encodeURIComponent(state.scenario)}&step=${state.step}`, { signal: controller.signal });
      window.clearTimeout(timeout);
      if (!response.ok) throw new Error("状态接口不可用");
      data = await response.json();
      usedApi = true;
    } catch (error) {
      data = staticState();
    }
  } else {
    data = staticState();
  }

  if (requestId !== loadSequence) return;
  state.data = data;
  setRuntimeMode(usedApi ? "本地分析引擎" : "免安装在线演示", !usedApi);
  render();
}

function render() {
  const data = state.data;
  if (!data) return;
  const meta = data.meta;
  $("scenario-label").textContent = data.scenario.label;
  $("scenario-description").textContent = scenarioDescriptions[state.scenario];
  $("time-output").textContent = timeLabel(meta.step);
  $("time-slider").value = meta.step;
  $("kpi-hotspots").textContent = meta.hotspots;
  $("kpi-vessels").textContent = meta.active_vessels;
  $("kpi-throughput").textContent = `${meta.total_up_mb.toFixed(0)} / ${meta.total_down_mb.toFixed(0)}`;
  $("kpi-alerts").textContent = meta.alert_count;
  $("alert-count-label").textContent = `${meta.alert_count} 条`;
  renderMap(data);
  renderTrend(data.trend);
  renderAlerts(data.alerts);
  renderRecommendation(data.recommendation);
  renderSelection();
}

function renderMap(data) {
  const svg = $("map-svg");
  const cellW = 960 / 12;
  const cellH = 470 / 12;
  const top = 38;
  let html = `<rect x="0" y="0" width="960" height="560" fill="#071d2e" rx="12"/>`;
  html += `<text x="20" y="24" class="axis-text">N ↑  仿真海域 / 网格化需求场</text>`;
  data.grid.forEach((cell) => {
    const x = cell.col * cellW + 2;
    const y = top + (11 - cell.row) * cellH + 2;
    const selected = state.selection?.type === "grid" && state.selection.id === cell.grid_id ? " selected" : "";
    const opacity = cell.heat_level === "非热点" ? .65 : .93;
    html += `<rect class="grid-cell${selected}" data-grid="${cell.grid_id}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cellW - 4).toFixed(1)}" height="${(cellH - 4).toFixed(1)}" rx="4" fill="${cell.heat_color}" fill-opacity="${opacity}"/>`;
    if (cell.heat_level !== "非热点" || cell.alert) html += `<text class="grid-label" x="${(x + 7).toFixed(1)}" y="${(y + 17).toFixed(1)}">${esc(cell.grid_id)}</text>`;
  });
  const baseStations = [[2, 3], [9, 8], [6, 1]];
  baseStations.forEach(([col, row]) => {
    const cx = col * cellW + cellW / 2;
    const cy = top + (11 - row) * cellH + cellH / 2;
    html += `<circle class="base-ring" cx="${cx}" cy="${cy}" r="30"/><circle class="base-ring" cx="${cx}" cy="${cy}" r="18"/><circle class="base-dot" cx="${cx}" cy="${cy}" r="3"/>`;
  });
  const pathVessels = data.vessels.filter((v) => data.tracks[v.vessel_id] && data.tracks[v.vessel_id].length > 1).slice(0, 28);
  pathVessels.forEach((vessel) => {
    const points = data.tracks[vessel.vessel_id].map((point) => {
      const px = ((point.lon - 118) / 2) * 960;
      const py = top + (1 - (point.lat - 24) / 2) * 470;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(" ");
    html += `<polyline class="sea-route" points="${points}"/>`;
  });
  data.vessels.forEach((vessel) => {
    const cx = ((vessel.lon - 118) / 2) * 960;
    const cy = top + (1 - (vessel.lat - 24) / 2) * 470;
    const selected = state.selection?.type === "vessel" && state.selection.id === vessel.vessel_id ? " selected" : "";
    const color = behaviorColors[vessel.behavior] || "#62d7ef";
    html += `<circle class="ship-dot${selected}" data-vessel="${vessel.vessel_id}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${vessel.alert ? 5 : 3.2}" fill="${color}"/>`;
  });
  html += `<text x="20" y="540" class="axis-text">S ↓  基站覆盖圈以浅色环表示 · 船舶颜色对应推断作业</text>`;
  svg.innerHTML = html;
  svg.querySelectorAll("[data-grid]").forEach((node) => node.addEventListener("click", () => { state.selection = { type: "grid", id: node.dataset.grid }; renderSelection(); renderMap(data); }));
  svg.querySelectorAll("[data-vessel]").forEach((node) => node.addEventListener("click", (event) => { event.stopPropagation(); state.selection = { type: "vessel", id: node.dataset.vessel }; renderSelection(); renderMap(data); }));
}

function renderTrend(points) {
  const svg = $("trend-svg");
  if (!points.length) { svg.innerHTML = ""; return; }
  const left = 48, top = 22, width = 820, height = 190;
  const maxValue = Math.max(...points.map((p) => Math.max(p.up_mb, p.down_mb)), 1);
  const point = (index, value, max = maxValue) => `${(left + (index / Math.max(1, points.length - 1)) * width).toFixed(1)},${(top + height - (value / max) * height).toFixed(1)}`;
  const up = points.map((p, i) => point(i, p.up_mb)).join(" ");
  const down = points.map((p, i) => point(i, p.down_mb)).join(" ");
  const load = points.map((p, i) => point(i, p.load, 100)).join(" ");
  let html = `<line class="axis-line" x1="${left}" y1="${top + height}" x2="${left + width}" y2="${top + height}"/><line class="axis-line" x1="${left}" y1="${top}" x2="${left}" y2="${top + height}"/>`;
  [0, .5, 1].forEach((ratio) => { const y = top + height - ratio * height; html += `<line class="axis-line" x1="${left}" y1="${y}" x2="${left + width}" y2="${y}"/><text class="axis-text" x="8" y="${y + 4}">${Math.round(maxValue * ratio)} MB</text>`; });
  html += `<polyline class="trend-line" stroke="#62d7ef" points="${up}"/><polyline class="trend-line" stroke="#5dd4b4" points="${down}"/><polyline class="trend-line" stroke="#ffb35c" stroke-dasharray="5 6" points="${load}"/>`;
  const tickIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  tickIndexes.forEach((index) => { const x = left + (index / Math.max(1, points.length - 1)) * width; html += `<text class="axis-text" x="${x - 16}" y="${top + height + 23}">${points[index].label}</text>`; });
  html += `<text class="axis-text" x="${left + width - 72}" y="${top + 13}">最近24个时间窗</text>`;
  svg.innerHTML = html;
}

function renderAlerts(alerts) {
  const body = $("alerts-body");
  if (!alerts.length) { body.innerHTML = `<tr><td colspan="4" class="empty-state">当前时间窗暂无联合预警</td></tr>`; return; }
  body.innerHTML = alerts.slice(0, 8).map((alert) => `<tr data-alert-grid="${esc(alert.grid_id)}"><td class="severity-${alert.level === "高" ? "high" : "medium"}">${esc(alert.level)}</td><td>${esc(alert.grid_id)}</td><td>${esc(alert.type)}</td><td>${esc(alert.evidence)}</td></tr>`).join("");
  body.querySelectorAll("[data-alert-grid]").forEach((node) => node.addEventListener("click", () => { state.selection = { type: "grid", id: node.dataset.alertGrid }; renderSelection(); renderMap(state.data); }));
}

function renderRecommendation(recommendation) {
  $("recommendation-type").textContent = recommendation.type;
  $("recommendation-text").textContent = `${recommendation.text} 关联网格：${recommendation.grid_id}`;
}

function renderSelection() {
  if (!state.data || !state.selection) return;
  const data = state.data;
  const title = $("detail-title");
  const badge = $("detail-badge");
  const content = $("detail-content");
  if (state.selection.type === "grid") {
    const cell = data.grid.find((item) => item.grid_id === state.selection.id);
    if (!cell) return;
    title.textContent = cell.grid_id;
    badge.textContent = cell.alert ? cell.alert_type : cell.heat_level;
    badge.className = `status-badge ${cell.heat_level === "高热度" ? "high" : cell.heat_level === "中热度" ? "medium" : "low"}`;
    content.innerHTML = `<div class="detail-main">${esc(cell.heat_level)}</div><div class="detail-grid"><div class="detail-item"><span>总流量</span><strong>${cell.total_mb.toFixed(1)} MB</strong></div><div class="detail-item"><span>活跃终端</span><strong>${cell.active_devices}</strong></div><div class="detail-item"><span>网格负载</span><strong>${cell.prb_load.toFixed(0)}%</strong></div><div class="detail-item"><span>船舶数量</span><strong>${cell.vessel_count} 艘</strong></div></div><p class="evidence-line">${cell.alert ? `预警证据：${esc(cell.alert_type)}，多源信号偏离基线，建议结合船舶轨迹开展核验。` : "当前网格未触发异常，系统持续积累滚动基线。"}</p>`;
  } else {
    const vessel = data.vessels.find((item) => item.vessel_id === state.selection.id);
    if (!vessel) return;
    title.textContent = vessel.vessel_id;
    badge.textContent = vessel.behavior;
    badge.className = "status-badge medium";
    content.innerHTML = `<div class="detail-main">${esc(vessel.behavior)}</div><div class="detail-grid"><div class="detail-item"><span>所在网格</span><strong>${esc(vessel.grid_id)}</strong></div><div class="detail-item"><span>识别置信度</span><strong>${(vessel.confidence * 100).toFixed(0)}%</strong></div><div class="detail-item"><span>速度 / 航向</span><strong>${vessel.sog.toFixed(1)} kn / ${vessel.cog.toFixed(0)}°</strong></div><div class="detail-item"><span>上行 / 下行</span><strong>${vessel.up_mb.toFixed(1)} / ${vessel.down_mb.toFixed(1)} MB</strong></div></div><p class="evidence-line">识别依据：运动速度、转向特征与上下行流量结构联合判断；该结果用于辅助决策，不替代人工核验。</p>`;
  }
}

function togglePlay() {
  if (state.timer) {
    clearInterval(state.timer); state.timer = null; $("play-button").textContent = "▶ 播放推演"; return;
  }
  $("play-button").textContent = "Ⅱ 暂停推演";
  state.timer = setInterval(() => { state.step = (state.step + 1) % 288; loadState().catch(stopPlay); }, 650);
}
function stopPlay() { if (state.timer) { clearInterval(state.timer); state.timer = null; $("play-button").textContent = "▶ 播放推演"; } }

$("scenario-select").addEventListener("change", (event) => { state.scenario = event.target.value; state.selection = null; state.step = state.scenario === "baseline" ? 150 : 165; loadState().catch(console.error); });
$("time-slider").addEventListener("input", (event) => { state.step = Number(event.target.value); loadState().catch(console.error); });
$("play-button").addEventListener("click", togglePlay);
$("export-button").addEventListener("click", () => {
  if (!state.data) return;
  const content = JSON.stringify(state.data, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `海域感知_${state.scenario}_${timeLabel(state.step).replace(":", "-")}_非增程式柠檬.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
});
loadState().catch((error) => { $("detail-content").innerHTML = `<p class="empty-state">平台状态加载失败：${esc(error.message)}</p>`; });
