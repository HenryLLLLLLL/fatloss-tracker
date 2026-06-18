#!/usr/bin/env python3
"""
FatLoss Tracker - 数据录入模块
支持体重、饮食、训练数据的录入
"""
import sqlite3
import json
import os
import sys
from datetime import datetime, date

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "fatloss.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def log_weight(date_str, weight_kg, bodyfat_pct=None, muscle_kg=None, bmr_kcal=None,
               bmi=None, fat_mass_kg=None, lean_mass_kg=None, muscle_rate_pct=None,
               skeletal_muscle_rate=None, bone_mass_kg=None, protein_rate=None,
               body_water_rate=None, body_water_kg=None, subcutaneous_fat_rate=None,
               visceral_fat_level=None, body_age=None, notes=""):
    """录入体重数据（含完整体成分）"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO weight_log (date, weight_kg, bmi, bodyfat_pct, fat_mass_kg,
                   lean_mass_kg, muscle_kg, muscle_rate_pct, skeletal_muscle_rate,
                   bone_mass_kg, protein_rate, body_water_rate, body_water_kg,
                   subcutaneous_fat_rate, visceral_fat_level, bmr_kcal, body_age, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (date_str, weight_kg, bmi, bodyfat_pct, fat_mass_kg, lean_mass_kg, muscle_kg,
          muscle_rate_pct, skeletal_muscle_rate, bone_mass_kg, protein_rate,
          body_water_rate, body_water_kg, subcutaneous_fat_rate,
          visceral_fat_level, bmr_kcal, body_age, notes))
    conn.commit()
    conn.close()
    return {"status": "ok", "date": date_str, "weight_kg": weight_kg}


def log_diet_meal(date_str, meal_type, food, calories=0, protein_g=0, carbs_g=0, fat_g=0, notes=""):
    """录入单餐饮食"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO diet_log (date, meal_type, food, calories, protein_g, carbs_g, fat_g, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (date_str, meal_type, food, calories, protein_g, carbs_g, fat_g, notes))
    conn.commit()
    conn.close()
    return {"status": "ok", "date": date_str, "meal_type": meal_type}


def log_diet_summary(date_str, total_calories, protein_g=0, carbs_g=0, fat_g=0, notes=""):
    """简化模式：录入全天总热量"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO diet_log (date, meal_type, food, calories, protein_g, carbs_g, fat_g, notes)
        VALUES (?, 'summary', '全天汇总', ?, ?, ?, ?, ?)
    """, (date_str, total_calories, protein_g, carbs_g, fat_g, notes))
    conn.commit()
    conn.close()
    return {"status": "ok", "date": date_str, "total_calories": total_calories}


def log_training(date_str, training_type, focus_area="", duration_min=0, 
                 estimated_calories=0, superset_rounds=0, notes=""):
    """录入训练数据"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO training_log (date, training_type, focus_area, duration_min, 
                                  estimated_calories, superset_rounds, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (date_str, training_type, focus_area, duration_min, 
          estimated_calories, superset_rounds, notes))
    conn.commit()
    conn.close()
    return {"status": "ok", "date": date_str, "training_type": training_type}


def get_daily_diet(date_str):
    """获取某天的饮食汇总"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT date, SUM(calories) as cal, SUM(protein_g) as pro, 
               SUM(carbs_g) as carbs, SUM(fat_g) as fat
        FROM diet_log WHERE date = ? AND meal_type != 'summary'
        GROUP BY date
    """, (date_str,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def get_daily_training(date_str):
    """获取某天的训练汇总"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT date, SUM(estimated_calories) as cal_out, 
               GROUP_CONCAT(DISTINCT training_type) as types,
               SUM(duration_min) as duration
        FROM training_log WHERE date = ?
        GROUP BY date
    """, (date_str,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def get_latest_weight():
    """获取最新体重"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM weight_log ORDER BY date DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_weight_history():
    """获取全部体重历史"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM weight_log ORDER BY date ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


if __name__ == "__main__":
    # CLI 入口
    if len(sys.argv) < 2:
        print("Usage:")
        print("  log_entry.py weight <date> <kg> [bodyfat%] [muscle_kg] [bmr]")
        print("  log_entry.py meal <date> <meal_type> <food> <cal> [pro] [carbs] [fat]")
        print("  log_entry.py summary <date> <total_cal> [pro] [carbs] [fat]")
        print("  log_entry.py training <date> <type> <focus> <min> <cal> [supersets]")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "weight":
        d, w = sys.argv[2], float(sys.argv[3])
        bf = float(sys.argv[4]) if len(sys.argv) > 4 else None
        mu = float(sys.argv[5]) if len(sys.argv) > 5 else None
        bm = int(sys.argv[6]) if len(sys.argv) > 6 else None
        result = log_weight(d, w, bf, mu, bm)
    elif cmd == "meal":
        d, mt, food, cal = sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
        pro = float(sys.argv[6]) if len(sys.argv) > 6 else 0
        carbs = float(sys.argv[7]) if len(sys.argv) > 7 else 0
        fat = float(sys.argv[8]) if len(sys.argv) > 8 else 0
        result = log_diet_meal(d, mt, food, cal, pro, carbs, fat)
    elif cmd == "summary":
        d, cal = sys.argv[2], int(sys.argv[3])
        pro = float(sys.argv[4]) if len(sys.argv) > 4 else 0
        carbs = float(sys.argv[5]) if len(sys.argv) > 5 else 0
        fat = float(sys.argv[6]) if len(sys.argv) > 6 else 0
        result = log_diet_summary(d, cal, pro, carbs, fat)
    elif cmd == "training":
        d, tt, fa, dur, cal = sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), int(sys.argv[6])
        ss = int(sys.argv[7]) if len(sys.argv) > 7 else 0
        result = log_training(d, tt, fa, dur, cal, ss)
    print(json.dumps(result, ensure_ascii=False))
