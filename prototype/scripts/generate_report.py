from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from analyze import evaluate  # noqa: E402
from generate_data import SCENARIOS, generate_records  # noqa: E402


def main() -> None:
    baseline_vessels, baseline_grids = generate_records("baseline")
    lines = [
        "# 仿真验证报告（V0.5）",
        "",
        "作者：非增程式柠檬（本项目原创成果唯一作者与权利主体）  ",
        f"生成日期：{date.today().isoformat()}  ",
        "数据性质：完全合成，仅用于方法验证与平台试用。",
        "",
        "## 1. 验证目标",
        "",
        "验证时空融合、海域热度分级、船舶作业画像和异常预警是否能够在固定随机种子下稳定运行。命题要求的热点分级准确率与异常检测召回率作为主要参考指标，同时补充行为识别准确率。",
        "",
        "## 2. 数据与设置",
        "",
        "- 海域网格：12 × 12；时间窗：5分钟；时间跨度：24小时。",
        "- 船舶数量：80艘；轨迹与流量采用固定随机种子生成。",
        "- 场景：正常基线、捕捞热度上升、船舶群聚、通信中断、直播上行激增。",
        "- 评价：网格热度准确率、船舶行为识别准确率、事件级异常召回率。",
        "",
        "## 3. 结果",
        "",
        "| 场景 | 热度分级准确率 | 行为识别准确率 | 异常召回率 | 样本规模 |",
        "|---|---:|---:|---:|---:|",
    ]
    for scenario in SCENARIOS:
        vessels, grids = generate_records(scenario)
        metrics = evaluate(vessels, grids, baseline_grids)
        sample_count = metrics["samples"]["grid_records"]
        recall = "—" if metrics["samples"]["truth_alert_cells"] == 0 else f"{metrics['anomaly_recall']:.1%}"
        lines.append(f"| {SCENARIOS[scenario]} | {metrics['hotspot_accuracy']:.1%} | {metrics['behavior_accuracy']:.1%} | {recall} | {sample_count:,}网格窗 |")
    lines += [
        "",
        "## 4. 解释与限制",
        "",
        "本报告结果用于证明数据链路、算法接口和交互平台可以闭环运行，不代表真实运营商生产网络效果。真实部署时需要使用经过授权的聚合流量、脱敏轨迹和业务标签重新训练与标定，并按区域、季节、天气和网络制式做分层验证。",
        "",
        "## 5. 投资价值验证",
        "",
        "平台将网络侧的流量变化转译为可行动的海上业务信号：运营商可以据此进行海域容量保障、重点区域巡检和上行资源规划；海洋治理方可以获得异常活动的多源佐证；渔业服务方可以获得更贴近作业时段的通信保障。后续商业化重点是接入真实聚合数据、沉淀行业模型和形成区域化运营报表。",
    ]
    report = ROOT / "reports" / "validation_report.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
