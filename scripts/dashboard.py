#!/usr/bin/env python3
"""
FatLoss Tracker - HTML 可视化仪表盘
基于 Chart.js，生成可交互的减脂看板
"""
import sqlite3
import json
import os
from datetime import date, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "fatloss.db")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "outputs")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_config():
    conn = get_db()
    row = conn.execute("SELECT * FROM user_config WHERE id = 1").fetchone()
    conn.close()
    return dict(row) if row else None


def get_weight_data():
    conn = get_db()
    rows = conn.execute("SELECT date, weight_kg, bodyfat_pct FROM weight_log ORDER BY date ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_daily_data():
    conn = get_db()
    rows = conn.execute("SELECT * FROM daily_summary ORDER BY date ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_recent_suggestions():
    """根据数据生成智能建议"""
    config = get_config()
    weights = get_weight_data()
    dailies = get_daily_data()
    
    suggestions = []
    
    if not weights:
        return ["暂无数据，请录入第一笔体重数据。"]
    
    latest = weights[-1]
    remaining = latest["weight_kg"] - config["target_weight_kg"]
    
    # 进度建议
    if len(weights) >= 2:
        first = weights[0]
        total_lost = first["weight_kg"] - latest["weight_kg"]
        days = (date.fromisoformat(latest["date"]) - date.fromisoformat(first["date"])).days
        weekly_rate = total_lost / max(days, 1) * 7
        
        if days >= 7:
            if weekly_rate > 1.0:
                suggestions.append(f"⚡ 当前周减重速度 {weekly_rate:.1f}kg，偏快，注意保肌。建议蛋白质不低于 {config['protein_target_g']}g/天。")
            elif weekly_rate < 0.3:
                suggestions.append(f"🐢 当前周减重速度 {weekly_rate:.1f}kg，偏慢。检查是否有额外摄入，或考虑进餐时间窗口调整。")
            else:
                suggestions.append(f"✅ 减重节奏合理，周均 {weekly_rate:.1f}kg。继续坚持当前方案。")
    
    # 剩余目标
    weeks = remaining / 0.7
    suggestions.append(f"🎯 距目标还差 {remaining:.1f}kg，按标准速度预计 {weeks:.0f} 周（约 {weeks/4.3:.1f} 个月）达标。")
    
    # 饮食建议
    if dailies and len(dailies) >= 3:
        recent_cals = [d["calories_in"] for d in dailies[-7:] if d["calories_in"] > 0]
        if recent_cals:
            avg_cal = sum(recent_cals) / len(recent_cals)
            if avg_cal > config["daily_cal_target"] + 150:
                suggestions.append(f"⚠️ 近7日平均摄入 {avg_cal:.0f} kcal，超出目标 {config['daily_cal_target']} kcal。建议控制晚餐碳水和油脂摄入。")
            elif avg_cal < config["daily_cal_target"] - 200:
                suggestions.append(f"💡 近7日平均摄入 {avg_cal:.0f} kcal，偏低。若训练强度不变可适当增加碳水保证训练质量。")
        
        recent_protein = [d["protein_g"] for d in dailies[-7:] if d["protein_g"] > 0]
        if recent_protein:
            avg_pro = sum(recent_protein) / len(recent_protein)
            if avg_pro < config["protein_target_g"] * 0.85:
                suggestions.append(f"🥩 近7日蛋白质平均 {avg_pro:.0f}g（目标 {config['protein_target_g']}g），需增加。建议：每餐保证一掌大小瘦肉，训练后30分钟内补充蛋白。")
    
    # 训练建议
    suggestions.append("🏋️ 训练提醒：力量训练日保证蛋白质摄入150g+，训练前后补充碳水（香蕉/燕麦/米饭）。打拳日可适当增加碳水。")
    
    if remaining < 5:
        suggestions.append("🔥 已进入减脂冲刺阶段！最后5kg最难减，坚持住，如果有平台期考虑调整训练结构或安排1周碳水循环。")
    
    return suggestions


def generate_dashboard():
    """生成完整的 HTML 仪表盘"""
    config = get_config()
    weights = get_weight_data()
    dailies = get_daily_data()
    suggestions = get_recent_suggestions()
    
    if not config:
        return "<h1>请先初始化数据库</h1>"
    
    # 准备图表数据
    weight_dates = [w["date"] for w in weights]
    weight_vals = [w["weight_kg"] for w in weights]
    bf_vals = [w["bodyfat_pct"] for w in weights]
    
    # 目标线
    target_line = [config["target_weight_kg"]] * max(len(weight_vals), 2)
    
    # 卡路里数据
    cal_dates = [d["date"] for d in dailies if d["calories_in"] > 0]
    cal_in_vals = [d["calories_in"] for d in dailies if d["calories_in"] > 0]
    cal_out_vals = [d["calories_out"] for d in dailies if d["calories_in"] > 0]
    cal_target_line = [config["daily_cal_target"]] * max(len(cal_in_vals), 2)
    
    # 蛋白质数据
    protein_vals = [d["protein_g"] for d in dailies if d["protein_g"] > 0]
    protein_target_line = [config["protein_target_g"]] * max(len(protein_vals), 2)
    
    # 统计摘要
    latest_w = weights[-1] if weights else {"weight_kg": config["start_weight_kg"], "bodyfat_pct": None}
    first_w = weights[0] if weights else {"weight_kg": config["start_weight_kg"]}
    total_lost = first_w["weight_kg"] - latest_w["weight_kg"]
    remaining = latest_w["weight_kg"] - config["target_weight_kg"]
    progress_pct = max(0, min(100, round(total_lost / (first_w["weight_kg"] - config["target_weight_kg"]) * 100, 1)))
    
    days = len(weights)
    if days >= 2:
        week_rate = total_lost / max((date.fromisoformat(latest_w["date"]) - date.fromisoformat(first_w["date"])).days, 1) * 7
    else:
        week_rate = 0
    
    est_weeks = remaining / 0.7 if remaining > 0 else 0
    
    # 饮食分析
    recent_7 = [d for d in dailies[-7:] if d["calories_in"] > 0]
    avg_cal = sum(d["calories_in"] for d in recent_7) / len(recent_7) if recent_7 else 0
    avg_pro = sum(d["protein_g"] for d in recent_7) / len(recent_7) if recent_7 else 0
    
    # 训练统计
    training_days = [d for d in dailies if d["calories_out"] > 0]
    
    today = date.today().isoformat()
    
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FatLoss · 刘昊减脂追踪看板</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #f5f7fa; color: #333; }}
.header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: white; padding: 30px 40px; }}
.header h1 {{ font-size: 28px; margin-bottom: 5px; }}
.header .sub {{ opacity: .7; font-size: 14px; }}
.container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}

/* 统计卡片 */
.stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 20px 0; }}
.stat-card {{ background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }}
.stat-card .label {{ font-size: 13px; color: #888; margin-bottom: 6px; }}
.stat-card .value {{ font-size: 28px; font-weight: 700; }}
.stat-card .unit {{ font-size: 14px; color: #888; margin-left: 2px; }}
.stat-card .sub-value {{ font-size: 12px; color: #999; margin-top: 4px; }}
.red {{ color: #e74c3c; }}
.green {{ color: #27ae60; }}
.blue {{ color: #2980b9; }}
.orange {{ color: #f39c12; }}
.purple {{ color: #8e44ad; }}

/* 图表区 */
.chart-row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }}
.chart-card {{ background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }}
.chart-card.full {{ grid-column: 1 / -1; }}
.chart-card h3 {{ font-size: 16px; margin-bottom: 16px; color: #1a1a2e; }}
.chart-wrap {{ position: relative; height: 280px; }}
.chart-wrap.tall {{ height: 340px; }}

/* 建议区 */
.suggestions {{ background: white; border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,.06); }}
.suggestions h3 {{ font-size: 16px; margin-bottom: 16px; color: #1a1a2e; }}
.suggestion-item {{ padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; line-height: 1.6; }}
.suggestion-item:last-child {{ border-bottom: none; }}

/* 数据表格 */
.data-table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
.data-table th {{ background: #f8f9fa; padding: 10px 12px; text-align: left; font-weight: 600; color: #555; border-bottom: 2px solid #e0e0e0; }}
.data-table td {{ padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }}
.data-table tr:hover {{ background: #fafbfc; }}

/* 进度条 */
.progress-bar {{ background: #e9ecef; border-radius: 10px; height: 12px; overflow: hidden; margin: 10px 0; }}
.progress-fill {{ height: 100%; border-radius: 10px; transition: width .5s ease; background: linear-gradient(90deg, #27ae60, #2ecc71); }}

@media (max-width: 768px) {{
    .chart-row {{ grid-template-columns: 1fr; }}
    .stats-grid {{ grid-template-columns: repeat(2, 1fr); }}
}}

/* 训练日志 */
.training-list {{ font-size: 13px; }}
.training-item {{ padding: 8px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; }}
.training-item:last-child {{ border-bottom: none; }}
.training-item .type-badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }}
.badge-boxing {{ background: #ffeaa7; color: #d68910; }}
.badge-strength {{ background: #dfe6e9; color: #636e72; }}
.badge-hybrid {{ background: #fab1a0; color: #c0392b; }}
.badge-rest {{ background: #b2bec3; color: #2d3436; }}
</style>
</head>
<body>

<div class="header">
    <h1>🔥 FatLoss · 刘昊减脂追踪</h1>
    <div class="sub">目标 65kg | 标准方案 v1.0 | 更新于 {today}</div>
</div>

<div class="container">

    <!-- 统计卡片 -->
    <div class="stats-grid">
        <div class="stat-card">
            <div class="label">当前体重</div>
            <div class="value blue">{latest_w['weight_kg']}<span class="unit">kg</span></div>
            <div class="sub-value">目标 {config['target_weight_kg']} kg</div>
        </div>
        <div class="stat-card">
            <div class="label">已减</div>
            <div class="value green">{total_lost:.1f}<span class="unit">kg</span></div>
            <div class="sub-value">还剩 {remaining:.1f} kg</div>
        </div>
        <div class="stat-card">
            <div class="label">完成进度</div>
            <div class="value purple">{progress_pct}<span class="unit">%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width:{progress_pct}%"></div></div>
        </div>
        <div class="stat-card">
            <div class="label">周均减重</div>
            <div class="value orange">{week_rate:.2f}<span class="unit">kg</span></div>
            <div class="sub-value">预计 {est_weeks:.0f} 周达标</div>
        </div>
        <div class="stat-card">
            <div class="label">7日平均摄入</div>
            <div class="value red">{avg_cal:.0f}<span class="unit">kcal</span></div>
            <div class="sub-value">目标 {config['daily_cal_target']} kcal</div>
        </div>
        <div class="stat-card">
            <div class="label">7日平均蛋白质</div>
            <div class="value blue">{avg_pro:.0f}<span class="unit">g</span></div>
            <div class="sub-value">目标 {config['protein_target_g']} g</div>
        </div>
        <div class="stat-card">
            <div class="label">记录天数</div>
            <div class="value" style="color:#333;">{days}<span class="unit">天</span></div>
            <div class="sub-value">训练日 {len(training_days)} 天</div>
        </div>
        <div class="stat-card">
            <div class="label">当前体脂率</div>
            <div class="value orange">{latest_w.get('bodyfat_pct') or '--'}<span class="unit">%</span></div>
            <div class="sub-value">目标 15%</div>
        </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-row">
        <div class="chart-card full">
            <h3>📈 体重趋势</h3>
            <div class="chart-wrap">
                <canvas id="weightChart"></canvas>
            </div>
        </div>
    </div>

    <div class="chart-row">
        <div class="chart-card">
            <h3>🍽️ 热量摄入 vs 消耗</h3>
            <div class="chart-wrap">
                <canvas id="calorieChart"></canvas>
            </div>
        </div>
        <div class="chart-card">
            <h3>🥩 蛋白质摄入趋势</h3>
            <div class="chart-wrap">
                <canvas id="proteinChart"></canvas>
            </div>
        </div>
    </div>

    <div class="chart-row">
        <div class="chart-card">
            <h3>📊 热量缺口分布</h3>
            <div class="chart-wrap">
                <canvas id="deficitChart"></canvas>
            </div>
        </div>
        <div class="chart-card">
            <h3>⚖️ 体脂率趋势</h3>
            <div class="chart-wrap">
                <canvas id="bfChart"></canvas>
            </div>
        </div>
    </div>

    <!-- 建议区 -->
    <div class="suggestions">
        <h3>🧠 AI 个性化建议</h3>
        {''.join(f'<div class="suggestion-item">{s}</div>' for s in suggestions)}
    </div>

    <!-- 数据表格 -->
    <div class="chart-card full" style="margin-top: 20px;">
        <h3>📋 详细记录（最近10条）</h3>
        <div style="overflow-x:auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>体重</th>
                        <th>体脂</th>
                        <th>摄入</th>
                        <th>消耗</th>
                        <th>净热量</th>
                        <th>蛋白质</th>
                        <th>训练</th>
                    </tr>
                </thead>
                <tbody>
"""

    # 表格数据
    for d in reversed(dailies[-10:]):
        cal_in = d["calories_in"] or 0
        cal_out = d["calories_out"] or 0
        net = cal_in - cal_out
        net_str = f'<span style="color:{"#e74c3c" if net < 0 else "#27ae60"}">{net}</span>'
        train = d.get("training_types", "") or "休息"
        train_short = train[:12]
        html += f"""
                    <tr>
                        <td>{d["date"]}</td>
                        <td><strong>{d["weight_kg"]}</strong> kg</td>
                        <td>{d.get("bodyfat_pct") or "--"}</td>
                        <td>{cal_in} kcal</td>
                        <td>{cal_out} kcal</td>
                        <td>{net_str} kcal</td>
                        <td>{d.get("protein_g") or 0:.0f} g</td>
                        <td>{train_short}</td>
                    </tr>"""

    html += f"""
                </tbody>
            </table>
        </div>
    </div>

    <!-- 目标线 -->
    <div class="chart-card full" style="margin: 20px 0; text-align: center; padding: 30px;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 40px; flex-wrap: wrap;">
            <div style="text-align: center;">
                <div style="font-size: 12px; color: #888; margin-bottom: 4px;">起点</div>
                <div style="font-size: 24px; font-weight: 700;">{first_w['weight_kg']}<span style="font-size: 14px;">kg</span></div>
                <div style="font-size: 11px; color: #999;">{first_w['date']}</div>
            </div>
            <div style="font-size: 48px; opacity: .3;">→</div>
            <div style="text-align: center;">
                <div style="font-size: 12px; color: #888; margin-bottom: 4px;">当前</div>
                <div style="font-size: 32px; font-weight: 700; color: #2980b9;">{latest_w['weight_kg']}<span style="font-size: 16px;">kg</span></div>
                <div style="font-size: 11px; color: #e74c3c;">-{total_lost:.1f}kg</div>
            </div>
            <div style="font-size: 48px; opacity: .3;">→</div>
            <div style="text-align: center; border: 2px dashed #27ae60; border-radius: 12px; padding: 16px 24px;">
                <div style="font-size: 12px; color: #27ae60; margin-bottom: 4px;">🎯 目标</div>
                <div style="font-size: 32px; font-weight: 700; color: #27ae60;">{config['target_weight_kg']}<span style="font-size: 16px;">kg</span></div>
                <div style="font-size: 11px; color: #999;">约 {est_weeks:.0f} 周后</div>
            </div>
        </div>
    </div>

</div>

<script>
// 统一图表配置
Chart.defaults.font.family = "'PingFang SC','Microsoft YaHei',sans-serif";
Chart.defaults.font.size = 12;

const weightCtx = document.getElementById('weightChart').getContext('2d');
new Chart(weightCtx, {{
    type: 'line',
    data: {{
        labels: {json.dumps(weight_dates)},
        datasets: [
            {{
                label: '体重 (kg)',
                data: {json.dumps(weight_vals)},
                borderColor: '#2980b9',
                backgroundColor: 'rgba(41,128,185,0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
            }},
            {{
                label: '目标 65kg',
                data: {json.dumps(target_line)},
                borderColor: '#27ae60',
                borderDash: [6,6],
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
            }}
        ]
    }},
    options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{
            legend: {{ position: 'top' }},
            tooltip: {{ mode: 'index', intersect: false }}
        }},
        scales: {{
            y: {{
                title: {{ display: true, text: 'kg' }},
                min: {config['target_weight_kg'] - 2},
                max: {first_w['weight_kg'] + 2}
            }}
        }}
    }}
}});

// 卡路里图
const calCtx = document.getElementById('calorieChart').getContext('2d');
new Chart(calCtx, {{
    type: 'bar',
    data: {{
        labels: {json.dumps(cal_dates)},
        datasets: [
            {{
                label: '摄入 (kcal)',
                data: {json.dumps(cal_in_vals)},
                backgroundColor: 'rgba(231,76,60,0.6)',
                borderColor: '#e74c3c',
                borderWidth: 1,
            }},
            {{
                label: '消耗 (kcal)',
                data: {json.dumps(cal_out_vals)},
                backgroundColor: 'rgba(39,174,96,0.4)',
                borderColor: '#27ae60',
                borderWidth: 1,
            }},
            {{
                label: '目标摄入',
                data: {json.dumps(cal_target_line)},
                type: 'line',
                borderColor: '#e67e22',
                borderDash: [5,5],
                pointRadius: 0,
                fill: false,
            }}
        ]
    }},
    options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{ legend: {{ position: 'top' }} }},
        scales: {{ y: {{ title: {{ display: true, text: 'kcal' }} }} }}
    }}
}});

// 蛋白质图
const proCtx = document.getElementById('proteinChart').getContext('2d');
new Chart(proCtx, {{
    type: 'bar',
    data: {{
        labels: {json.dumps(cal_dates)},
        datasets: [
            {{
                label: '蛋白质 (g)',
                data: {json.dumps(protein_vals)},
                backgroundColor: 'rgba(142,68,173,0.5)',
                borderColor: '#8e44ad',
                borderWidth: 1,
            }},
            {{
                label: '目标 {config['protein_target_g']}g',
                data: {json.dumps(protein_target_line)},
                type: 'line',
                borderColor: '#e74c3c',
                borderDash: [5,5],
                pointRadius: 0,
            }}
        ]
    }},
    options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{ legend: {{ position: 'top' }} }},
        scales: {{ y: {{ title: {{ display: true, text: 'g' }} }} }}
    }}
}});

// 热量缺口图
const net_data = {json.dumps([d['calories_in'] - d['calories_out'] for d in dailies if d['calories_in'] > 0])};
const net_labels = {json.dumps(cal_dates)};
const colors = net_data.map(v => v < 0 ? 'rgba(39,174,96,0.6)' : 'rgba(231,76,60,0.6)');
const borders = net_data.map(v => v < 0 ? '#27ae60' : '#e74c3c');

const deficitCtx = document.getElementById('deficitChart').getContext('2d');
new Chart(deficitCtx, {{
    type: 'bar',
    data: {{
        labels: net_labels,
        datasets: [{{
            label: '热量缺口 (负值=消耗>摄入)',
            data: net_data,
            backgroundColor: colors,
            borderColor: borders,
            borderWidth: 1,
        }}]
    }},
    options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{ legend: {{ position: 'top' }} }},
        scales: {{ y: {{ title: {{ display: true, text: 'kcal' }} }} }}
    }}
}});

// 体脂率图
const bf_data = {json.dumps([v for v in bf_vals if v is not None])};
const bf_labels = {json.dumps([weight_dates[i] for i, v in enumerate(bf_vals) if v is not None])};
if (bf_data.length > 0) {{
    const bfCtx = document.getElementById('bfChart').getContext('2d');
    new Chart(bfCtx, {{
        type: 'line',
        data: {{
            labels: bf_labels,
            datasets: [
                {{
                    label: '体脂率 (%)',
                    data: bf_data,
                    borderColor: '#f39c12',
                    backgroundColor: 'rgba(243,156,18,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                }},
                {{
                    label: '目标 15%',
                    data: Array(bf_labels.length).fill(15),
                    borderColor: '#e74c3c',
                    borderDash: [6,6],
                    pointRadius: 0,
                    fill: false,
                }}
            ]
        }},
        options: {{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {{ legend: {{ position: 'top' }} }},
            scales: {{ y: {{ title: {{ display: true, text: '%' }}, min: 10, max: 30 }} }}
        }}
    }});
}} else {{
    document.getElementById('bfChart').parentElement.innerHTML = '<p style="text-align:center;color:#999;padding:60px;">暂无体脂率数据</p>';
}}
</script>

</body>
</html>"""

    return html


if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    html = generate_dashboard()
    output_path = os.path.join(OUTPUT_DIR, "dashboard.html")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Dashboard generated: {output_path}")
