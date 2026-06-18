#!/usr/bin/env python3
"""
FatLoss MCP Server — 减脂追踪微信端 MCP 服务

通过 stdio 协议暴露工具给 picoclaw，实现：
- 微信语音/文字录入饮食 → 自动解析热量 → 写入 Supabase
- 实时查询今日营养汇总 → 微信回复
- 体重趋势查询

启动方式:
  python server.py

配置:
  编辑 config.json，填入 DeepSeek API key
"""

import json
import sys
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from supabase_client import SupabaseClient
from food_parser import parse_meal, detect_meal_type

# ── Load config ──
_config_path = Path(__file__).parent / "config.json"
with open(_config_path, encoding="utf-8") as f:
    CONFIG = json.load(f)

# Environment overrides
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY") or CONFIG["deepseek"]["api_key"]
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL") or CONFIG["deepseek"]["base_url"]
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL") or CONFIG["deepseek"]["model"]

SUPABASE_URL = CONFIG["supabase"]["url"]
SUPABASE_KEY = CONFIG["supabase"]["anon_key"]

USER_CONFIG = CONFIG["user"]

# ── Init clients ──
sb = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)

# ── Create MCP Server ──
app = Server("fatloss-mcp")


# ══════════════════════════════════════════════════════════════════════
#  Tool handlers
# ══════════════════════════════════════════════════════════════════════

def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Tool 1: log_meal ──

def handle_log_meal(date: str, meal_text: str, manual: str = "") -> dict:
    """
    录入一餐。meal_text 为自然语言描述，可含语音转文字内容。
    manual 可选：手动指定的营养值 JSON '{"calories":500,"protein_g":30,...}'
    """
    date = date or _today()

    # Manual override?
    if manual:
        try:
            manual_data = json.loads(manual)
            result = {
                "meal_type": detect_meal_type(meal_text),
                "food": meal_text[:100],
                "calories": float(manual_data.get("calories", 0)),
                "protein_g": float(manual_data.get("protein_g", 0)),
                "carbs_g": float(manual_data.get("carbs_g", 0)),
                "fat_g": float(manual_data.get("fat_g", 0)),
                "notes": manual_data.get("notes", ""),
                "source": "manual",
            }
        except (json.JSONDecodeError, ValueError) as e:
            return {"success": False, "error": f"手动数据格式错误: {e}"}
    else:
        # Parse with DeepSeek + local DB
        try:
            result = parse_meal(meal_text, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL)
        except Exception as e:
            return {"success": False, "error": f"解析失败: {e}"}

    # Write to Supabase
    try:
        sb.log_meal(
            date=date,
            meal_type=result["meal_type"],
            food=result["food"],
            calories=result["calories"],
            protein_g=result["protein_g"],
            carbs_g=result["carbs_g"],
            fat_g=result["fat_g"],
            notes=result.get("notes", ""),
        )
    except Exception as e:
        return {"success": False, "error": f"写入 Supabase 失败: {e}"}

    # Get today's total so far
    try:
        today_diet = sb.get_today_diet(date)
        total_cal = sum(d.get("calories", 0) or 0 for d in today_diet)
        total_protein = sum(d.get("protein_g", 0) or 0 for d in today_diet)
        total_carbs = sum(d.get("carbs_g", 0) or 0 for d in today_diet)
        total_fat = sum(d.get("fat_g", 0) or 0 for d in today_diet)
    except Exception:
        total_cal = result["calories"]
        total_protein = result["protein_g"]
        total_carbs = result["carbs_g"]
        total_fat = result["fat_g"]

    return {
        "success": True,
        "meal": result,
        "today_summary": {
            "date": date,
            "total_calories": round(total_cal, 1),
            "total_protein": round(total_protein, 1),
            "total_carbs": round(total_carbs, 1),
            "total_fat": round(total_fat, 1),
            "cal_target": USER_CONFIG["daily_cal_target"],
            "protein_target": USER_CONFIG["protein_target_g"],
            "fat_target": USER_CONFIG["fat_target_g"],
            "carbs_target": USER_CONFIG["carbs_target_g"],
            "cal_remaining": USER_CONFIG["daily_cal_target"] - total_cal,
            "protein_remaining": USER_CONFIG["protein_target_g"] - total_protein,
        },
    }


# ── Tool 2: get_today_summary ──

def handle_today_summary(date: str = "") -> dict:
    """获取当日营养、体重、训练汇总。"""
    date = date or _today()

    try:
        weight = sb.get_weight(date)
        diet = sb.get_today_diet(date)
        training = sb.get_today_training(date)
    except Exception as e:
        return {"success": False, "error": f"查询失败: {e}"}

    # Aggregate diet
    meals = []
    total_cal = 0.0
    total_protein = 0.0
    total_carbs = 0.0
    total_fat = 0.0
    for d in diet:
        meals.append({
            "meal_type": d.get("meal_type"),
            "food": d.get("food"),
            "calories": d.get("calories", 0) or 0,
            "protein_g": d.get("protein_g", 0) or 0,
        })
        total_cal += d.get("calories", 0) or 0
        total_protein += d.get("protein_g", 0) or 0
        total_fat += d.get("fat_g", 0) or 0
        total_carbs += d.get("carbs_g", 0) or 0

    # Aggregate training
    train_total_cal = sum(t.get("estimated_calories", 0) or 0 for t in training)
    train_total_min = sum(t.get("duration_min", 0) or 0 for t in training)
    train_types = [t.get("training_type") for t in training]

    # Progress
    cal_target = USER_CONFIG["daily_cal_target"]
    protein_target = USER_CONFIG["protein_target_g"]
    net_cal = total_cal - train_total_cal

    # Build advice
    advice_parts = []
    if meals:
        # Determine which meal is still needed based on time
        if total_protein < protein_target * 0.5:
            advice_parts.append(f"蛋白还差 {protein_target - total_protein:.0f}g，建议晚餐多吃鸡胸/鸡蛋/豆腐")
        if total_cal < cal_target * 0.4:
            advice_parts.append(f"热量还差很多 ({cal_target - total_cal:.0f}kcal)，晚餐可以吃饱")
        elif total_cal > cal_target * 0.9:
            advice_parts.append(f"热量已接近目标，晚餐控制碳水")
    else:
        advice_parts.append("今天还没录入饮食呢！记得发消息告诉我吃了什么")

    return {
        "success": True,
        "date": date,
        "weight": {
            "weight_kg": weight.get("weight_kg") if weight else None,
            "bodyfat_pct": weight.get("bodyfat_pct") if weight else None,
        },
        "diet": {
            "meals": meals,
            "total_calories": round(total_cal, 1),
            "total_protein": round(total_protein, 1),
            "total_carbs": round(total_carbs, 1),
            "total_fat": round(total_fat, 1),
            "cal_target": cal_target,
            "protein_target": protein_target,
            "fat_target": USER_CONFIG["fat_target_g"],
            "carbs_target": USER_CONFIG["carbs_target_g"],
            "cal_remaining": round(cal_target - total_cal, 1),
            "protein_remaining": round(protein_target - total_protein, 1),
            "cal_progress_pct": round(total_cal / cal_target * 100, 1) if cal_target else 0,
            "protein_progress_pct": round(total_protein / protein_target * 100, 1) if protein_target else 0,
        },
        "training": {
            "types": train_types,
            "total_calories": round(train_total_cal, 1),
            "total_minutes": round(train_total_min, 1),
        },
        "net_calories": round(net_cal, 1),
        "advice": "；".join(advice_parts) if advice_parts else "数据正常，继续保持！",
    }


# ── Tool 3: get_weight_trend ──

def handle_weight_trend(days: int = 7) -> dict:
    """获取最近N天体重趋势。"""
    try:
        rows = sb.get_weight_history(limit=days)
    except Exception as e:
        return {"success": False, "error": str(e)}

    if not rows:
        return {"success": False, "error": "暂无体重数据"}

    trend = []
    for r in rows:
        trend.append({
            "date": r.get("date"),
            "weight_kg": r.get("weight_kg"),
            "bodyfat_pct": r.get("bodyfat_pct"),
        })

    # Calculate trend
    weights = [t["weight_kg"] for t in trend if t["weight_kg"]]
    if len(weights) >= 2:
        first_w = weights[0]
        last_w = weights[-1]
        total_delta = last_w - first_w
        per_day = total_delta / (len(weights) - 1) if len(weights) > 1 else 0
        weekly_rate = per_day * 7
    else:
        total_delta = 0
        weekly_rate = 0

    target_w = USER_CONFIG["target_weight_kg"]
    remaining = (weights[-1] - target_w) if weights else 0

    return {
        "success": True,
        "data": trend,
        "analysis": {
            "days": len(trend),
            "first_weight": weights[0] if weights else None,
            "latest_weight": weights[-1] if weights else None,
            "total_delta": round(total_delta, 2),
            "weekly_rate": round(weekly_rate, 2),
            "target_weight": target_w,
            "remaining_kg": round(remaining, 1),
            "estimated_weeks": round(remaining / abs(weekly_rate), 1) if weekly_rate != 0 and remaining > 0 else None,
        },
    }


# ── Tool 4: log_weight ──

def handle_log_weight(date: str = "", weight_kg: float = 0, bodyfat_pct: float = 0,
                       bmi: float = 0, notes: str = "") -> dict:
    """手动录入体重（通常由快捷指令自动完成，此工具作为备用）。"""
    date = date or _today()

    if weight_kg <= 0:
        return {"success": False, "error": "体重必须大于0"}

    data = {"weight_kg": weight_kg}
    if bodyfat_pct:
        data["bodyfat_pct"] = bodyfat_pct
    if bmi:
        data["bmi"] = bmi
    if notes:
        data["notes"] = notes

    try:
        sb.log_weight(date, data)
        return {"success": True, "message": f"已记录 {date} 体重 {weight_kg}kg"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Tool 5: log_training ──

def handle_log_training(date: str = "", training_type: str = "cardio",
                         duration_min: float = 0, estimated_calories: float = 0,
                         focus_area: str = "", notes: str = "") -> dict:
    """手动录入训练（通常由快捷指令自动完成，此工具作为备用）。"""
    date = date or _today()

    if duration_min <= 0:
        return {"success": False, "error": "训练时长必须大于0"}

    try:
        sb.log_training(date, training_type, duration_min, estimated_calories,
                        focus_area, notes)
        return {"success": True, "message": f"已记录 {date} 训练 {estimated_calories}kcal"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Tool 6: get_daily_report ──

def handle_daily_report(date: str = "") -> dict:
    """生成一份完整的日报摘要，适合微信端快速查看。"""
    date = date or _today()

    # Get all data
    summary = handle_today_summary(date)
    if not summary.get("success"):
        return summary

    weight = summary.get("weight", {}).get("weight_kg")

    # Get weight trend for context
    try:
        weight_data = sb.get_weight_history(limit=2)
        prev_weight = None
        if len(weight_data) >= 2:
            prev_weight = weight_data[-2].get("weight_kg")
        elif len(weight_data) == 1:
            weight_data_prev = sb.get_weight(date)
            if weight_data_prev and weight_data_prev.get("date") != date:
                prev_weight = weight_data_prev.get("weight_kg")
    except Exception:
        prev_weight = None

    # Format report
    diet = summary["diet"]
    train = summary["training"]
    advice = summary.get("advice", "")

    lines = []
    lines.append(f"📊 {USER_CONFIG['name']} 减脂日报 | {date}")

    if weight:
        delta_str = ""
        if prev_weight:
            delta = weight - prev_weight
            arrow = "↑" if delta > 0 else "↓" if delta < 0 else "→"
            delta_str = f" {arrow}{abs(delta):.1f}kg"
        lines.append(f"⚖️ 体重: {weight}kg{delta_str} | 目标: {USER_CONFIG['target_weight_kg']}kg")
    else:
        lines.append(f"⚖️ 体重: 暂无数据")

    lines.append(f"🍽️ 饮食: {diet['total_calories']}kcal / {diet['cal_target']}kcal "
                 f"({diet['cal_progress_pct']}%)")
    lines.append(f"🥩 蛋白: {diet['total_protein']}g / {diet['protein_target']}g "
                 f"({diet['protein_progress_pct']}%)")
    lines.append(f"🔥 运动: {train['total_calories']}kcal | {train['total_minutes']}分钟")
    lines.append(f"📉 净热量: {summary['net_calories']}kcal")

    remaining_cal = diet["cal_remaining"]
    remaining_protein = diet["protein_remaining"]
    remain_parts = []
    if remaining_cal > 0:
        remain_parts.append(f"还可以吃 {remaining_cal:.0f}kcal")
    else:
        remain_parts.append(f"已超标 {-remaining_cal:.0f}kcal")
    if remaining_protein > 0:
        remain_parts.append(f"蛋白还差 {remaining_protein:.0f}g")
    lines.append(f"💡 {' | '.join(remain_parts)}")

    if advice:
        lines.append(f"💬 {advice}")

    if diet["meals"]:
        lines.append("")
        lines.append("今日饮食:")
        for m in diet["meals"]:
            mtype = {"breakfast": "早", "lunch": "午", "dinner": "晚",
                     "snack": "零", "supplement": "补"}.get(m["meal_type"], "?")
            lines.append(f"  {mtype}: {m['food']} ({m['calories']}kcal, P:{m['protein_g']}g)")

    return {
        "success": True,
        "report_text": "\n".join(lines),
    }


# ══════════════════════════════════════════════════════════════════════
#  MCP Tool registration
# ══════════════════════════════════════════════════════════════════════

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="log_meal",
            description="录入一餐饮食。用自然语言描述吃了什么（支持语音转文字），自动估算热量和营养素并写入数据库。参数：date(日期YYYY-MM-DD，默认今天)、meal_text(食物描述，如「午餐食堂红烧牛肉饭加一杯牛奶」)、manual(可选，手动指定营养值JSON)",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "日期，格式YYYY-MM-DD，默认为今天"},
                    "meal_text": {"type": "string", "description": "自然语言食物描述，如「早餐两个鸡蛋一杯牛奶」"},
                    "manual": {"type": "string", "description": "手动指定营养值JSON，如{\"calories\":500,\"protein_g\":30,\"carbs_g\":50,\"fat_g\":15}，可选"},
                },
                "required": ["meal_text"],
            },
        ),
        Tool(
            name="get_today_summary",
            description="获取今日营养汇总：体重、已吃食物、热量/蛋白达标情况、运动消耗、AI建议。参数：date(日期，默认今天)",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "日期YYYY-MM-DD，默认今天"},
                },
                "required": [],
            },
        ),
        Tool(
            name="get_daily_report",
            description="生成格式化的减脂日报（微信端用），包含体重变化、饮食详情、运动消耗、进度分析和建议。参数：date(日期，默认今天)",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "日期YYYY-MM-DD，默认今天"},
                },
                "required": [],
            },
        ),
        Tool(
            name="get_weight_trend",
            description="获取最近N天体重趋势和变化速率。参数：days(天数，默认7)",
            inputSchema={
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "查询天数，默认7"},
                },
                "required": [],
            },
        ),
        Tool(
            name="log_weight",
            description="手动录入体重数据（备用，通常由Apple快捷指令自动完成）",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "日期，默认今天"},
                    "weight_kg": {"type": "number", "description": "体重(kg)"},
                    "bodyfat_pct": {"type": "number", "description": "体脂率(%)，可选"},
                    "bmi": {"type": "number", "description": "BMI，可选"},
                    "notes": {"type": "string", "description": "备注，可选"},
                },
                "required": ["weight_kg"],
            },
        ),
        Tool(
            name="log_training",
            description="手动录入训练数据（备用，通常由Apple快捷指令自动完成）",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "日期，默认今天"},
                    "training_type": {"type": "string", "description": "训练类型：boxing/strength/cardio/boxing_strength/rest"},
                    "duration_min": {"type": "number", "description": "时长(分钟)"},
                    "estimated_calories": {"type": "number", "description": "估计消耗(kcal)"},
                    "focus_area": {"type": "string", "description": "训练部位，可选"},
                    "notes": {"type": "string", "description": "备注，可选"},
                },
                "required": ["training_type", "duration_min", "estimated_calories"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "log_meal":
            result = handle_log_meal(
                date=arguments.get("date", ""),
                meal_text=arguments.get("meal_text", ""),
                manual=arguments.get("manual", ""),
            )
        elif name == "get_today_summary":
            result = handle_today_summary(date=arguments.get("date", ""))
        elif name == "get_daily_report":
            result = handle_daily_report(date=arguments.get("date", ""))
        elif name == "get_weight_trend":
            result = handle_weight_trend(days=int(arguments.get("days", 7)))
        elif name == "log_weight":
            result = handle_log_weight(
                date=arguments.get("date", ""),
                weight_kg=float(arguments.get("weight_kg", 0)),
                bodyfat_pct=float(arguments.get("bodyfat_pct", 0)),
                bmi=float(arguments.get("bmi", 0)),
                notes=arguments.get("notes", ""),
            )
        elif name == "log_training":
            result = handle_log_training(
                date=arguments.get("date", ""),
                training_type=arguments.get("training_type", "cardio"),
                duration_min=float(arguments.get("duration_min", 0)),
                estimated_calories=float(arguments.get("estimated_calories", 0)),
                focus_area=arguments.get("focus_area", ""),
                notes=arguments.get("notes", ""),
            )
        else:
            result = {"success": False, "error": f"Unknown tool: {name}"}

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Exception as e:
        return [TextContent(type="text", text=json.dumps(
            {"success": False, "error": str(e)}, ensure_ascii=False
        ))]


# ══════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════

async def main():
    async with stdio_server() as (reader, writer):
        await app.run(reader, writer, app.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
