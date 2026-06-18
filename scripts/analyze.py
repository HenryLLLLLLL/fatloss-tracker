#!/usr/bin/env python3
"""
FatLoss Tracker - 数据分析与趋势模块
"""
import sqlite3
import json
import os
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "fatloss.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_user_config():
    conn = get_db()
    row = conn.execute("SELECT * FROM user_config WHERE id = 1").fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_weight_data():
    conn = get_db()
    rows = conn.execute("SELECT date, weight_kg, bodyfat_pct FROM weight_log ORDER BY date ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_weight_trend():
    conn = get_db()
    rows = conn.execute("SELECT * FROM weight_trend ORDER BY date DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_daily_summaries(days=30):
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM daily_summary ORDER BY date ASC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_diet_detail(date_str):
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM diet_log WHERE date = ? ORDER BY meal_type
    """, (date_str,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_recent_meals(days=7):
    conn = get_db()
    cutoff = (date.today() - timedelta(days=days-1)).isoformat()
    rows = conn.execute("""
        SELECT date, meal_type, food, calories, protein_g, carbs_g, fat_g
        FROM diet_log WHERE date >= ? AND meal_type != 'summary'
        ORDER BY date DESC, meal_type
    """, (cutoff,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_training_recent(days=7):
    conn = get_db()
    cutoff = (date.today() - timedelta(days=days-1)).isoformat()
    rows = conn.execute("""
        SELECT date, training_type, focus_area, duration_min, estimated_calories, superset_rounds
        FROM training_log WHERE date >= ?
        ORDER BY date DESC
    """, (cutoff,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def analyze_progress():
    """核心分析：进度、趋势、预估"""
    config = get_user_config()
    if not config:
        return {"error": "No user config found. Please init database first."}
    
    weights = get_all_weight_data()
    if not weights:
        return {"error": "No weight data yet."}
    
    today = date.today().isoformat()
    latest = weights[-1]
    first = weights[0]
    
    days_elapsed = (date.fromisoformat(latest["date"]) - date.fromisoformat(first["date"])).days
    total_lost = first["weight_kg"] - latest["weight_kg"]
    daily_avg_loss = total_lost / max(days_elapsed, 1)
    weekly_avg_loss = daily_avg_loss * 7
    
    target = config["target_weight_kg"]
    remaining = latest["weight_kg"] - target
    
    if weekly_avg_loss > 0.01:
        weeks_to_target = remaining / weekly_avg_loss
        est_date = date.today() + timedelta(days=int(weeks_to_target * 7))
    else:
        weeks_to_target = None
        est_date = None
    
    # 计算体重趋势（线性回归）
    if len(weights) >= 3:
        n = len(weights)
        x_vals = list(range(n))
        y_vals = [w["weight_kg"] for w in weights]
        x_mean = sum(x_vals) / n
        y_mean = sum(y_vals) / n
        xy_sum = sum(x_vals[i] * y_vals[i] for i in range(n))
        x2_sum = sum(x * x for x in x_vals)
        slope = (xy_sum - n * x_mean * y_mean) / max(x2_sum - n * x_mean * x_mean, 0.01)
        trend_direction = "下降" if slope < 0 else "上升"
        trend_rate = abs(slope)
    else:
        slope = 0
        trend_direction = "数据不足"
        trend_rate = 0
    
    # 上周汇总
    week_ago = (date.today() - timedelta(days=7)).isoformat()
    conn = get_db()
    week_diet = conn.execute("""
        SELECT AVG(calories) as avg_cal FROM (
            SELECT date, SUM(calories) as calories 
            FROM diet_log WHERE date >= ? AND meal_type != 'summary'
            GROUP BY date
        )
    """, (week_ago,)).fetchone()
    week_protein = conn.execute("""
        SELECT AVG(protein_g) as avg_protein FROM (
            SELECT date, SUM(protein_g) as protein_g 
            FROM diet_log WHERE date >= ? AND meal_type != 'summary'
            GROUP BY date
        )
    """, (week_ago,)).fetchone()
    conn.close()
    
    result = {
        "today": today,
        "latest_weight": latest["weight_kg"],
        "latest_bodyfat": latest.get("bodyfat_pct"),
        "start_weight": first["weight_kg"],
        "target_weight": target,
        "days_elapsed": days_elapsed,
        "total_lost": round(total_lost, 2),
        "remaining": round(remaining, 2),
        "daily_avg_loss": round(daily_avg_loss, 3),
        "weekly_avg_loss": round(weekly_avg_loss, 3),
        "weeks_to_target": round(weeks_to_target, 1) if weeks_to_target else None,
        "est_target_date": est_date.isoformat() if est_date else None,
        "progress_pct": round((total_lost / (first["weight_kg"] - target)) * 100, 1) if first["weight_kg"] > target else 0,
        "trend_direction": trend_direction,
        "trend_slope": round(slope, 4),
        "daily_cal_target": config["daily_cal_target"],
        "protein_target": config["protein_target_g"],
        "avg_week_cal": round(week_diet["avg_cal"], 0) if week_diet and week_diet["avg_cal"] else None,
        "avg_week_protein": round(week_protein["avg_protein"], 0) if week_protein and week_protein["avg_protein"] else None,
    }
    return result


def generate_daily_report(date_str=None):
    """生成每日报告"""
    if date_str is None:
        date_str = date.today().isoformat()
    
    config = get_user_config()
    progress = analyze_progress()
    
    conn = get_db()
    weight_row = conn.execute("SELECT * FROM weight_log WHERE date = ?", (date_str,)).fetchone()
    diet_rows = conn.execute("SELECT * FROM diet_log WHERE date = ? AND meal_type != 'summary'", (date_str,)).fetchall()
    training_rows = conn.execute("SELECT * FROM training_log WHERE date = ?", (date_str,)).fetchall()
    conn.close()
    
    diet_total = sum(r["calories"] for r in diet_rows) if diet_rows else 0
    diet_protein = sum(r["protein_g"] for r in diet_rows) if diet_rows else 0
    diet_carbs = sum(r["carbs_g"] for r in diet_rows) if diet_rows else 0
    diet_fat = sum(r["fat_g"] for r in diet_rows) if diet_rows else 0
    
    cal_out = sum(r["estimated_calories"] for r in training_rows) if training_rows else 0
    net_cal = diet_total - cal_out if diet_total else None
    
    target_cal = config["daily_cal_target"] if config else 0
    cal_gap = diet_total - target_cal if diet_total else None
    
    # 建议生成
    suggestions = []
    if weight_row is None:
        suggestions.append("今日尚未录入体重数据，请补充。")
    if diet_total > 0 and target_cal > 0:
        if diet_total > target_cal + 200:
            suggestions.append(f"今日摄入超目标 {diet_total - target_cal} kcal，建议明日晚餐减少碳水摄入。")
        elif diet_total < target_cal - 300:
            suggestions.append(f"今日摄入偏低，比目标少 {target_cal - diet_total} kcal，注意不要过度节食以免掉肌肉。")
    if diet_protein > 0 and config and diet_protein < config["protein_target_g"] * 0.8:
        suggestions.append(f"蛋白质摄入不足，今日仅 {diet_protein:.0f}g，目标 {config['protein_target_g']}g。考虑补充鸡胸/蛋白粉/鸡蛋。")
    
    if progress.get("weekly_avg_loss") and progress["weekly_avg_loss"] > 1.0:
        suggestions.append("周均减重速度偏快（>1kg/周），可能伴随肌肉流失。建议适当增加蛋白质摄入或减少训练强度。")
    elif progress.get("weekly_avg_loss") and 0 < progress["weekly_avg_loss"] < 0.3 and progress.get("days_elapsed", 0) > 7:
        suggestions.append("周均减重速度偏慢（<0.3kg/周），检查摄入是否达标、是否有额外零食。")
    
    return {
        "date": date_str,
        "weight": dict(weight_row) if weight_row else None,
        "diet": {
            "meals": [dict(r) for r in diet_rows],
            "total_calories": diet_total,
            "total_protein": round(diet_protein, 1),
            "total_carbs": round(diet_carbs, 1),
            "total_fat": round(diet_fat, 1),
        },
        "training": [dict(r) for r in training_rows],
        "cal_out": cal_out,
        "net_calories": net_cal,
        "target_cal": target_cal,
        "cal_gap": cal_gap,
        "suggestions": suggestions,
        "progress": progress,
    }


if __name__ == "__main__":
    report = generate_daily_report()
    print(json.dumps(report, ensure_ascii=False, indent=2))
