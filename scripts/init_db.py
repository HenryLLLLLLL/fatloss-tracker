#!/usr/bin/env python3
"""
FatLoss Tracker - 数据库初始化
创建 SQLite 数据库和所有表结构
"""
import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "fatloss.db")


def get_schema():
    return """
    -- 用户配置表
    CREATE TABLE IF NOT EXISTS user_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        start_date TEXT NOT NULL,
        start_weight_kg REAL NOT NULL,
        target_weight_kg REAL NOT NULL,
        daily_cal_target INTEGER NOT NULL,
        protein_target_g REAL NOT NULL,
        fat_target_g REAL NOT NULL,
        carbs_target_g REAL NOT NULL,
        bmr_kcal INTEGER NOT NULL,
        activity_factor REAL NOT NULL,
        weekly_deficit_kcal INTEGER NOT NULL,
        notes TEXT,
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 体重日志表（完整体成分 16项指标）
    CREATE TABLE IF NOT EXISTS weight_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        weight_kg REAL NOT NULL,
        bmi REAL,
        bodyfat_pct REAL,
        fat_mass_kg REAL,
        lean_mass_kg REAL,
        muscle_kg REAL,
        muscle_rate_pct REAL,
        skeletal_muscle_rate REAL,
        bone_mass_kg REAL,
        protein_rate REAL,
        body_water_rate REAL,
        body_water_kg REAL,
        subcutaneous_fat_rate REAL,
        visceral_fat_level INTEGER,
        bmr_kcal INTEGER,
        body_age INTEGER,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 饮食日志表（逐餐详细记录）
    CREATE TABLE IF NOT EXISTS diet_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'supplement', 'summary')),
        food TEXT NOT NULL,
        calories INTEGER DEFAULT 0,
        protein_g REAL DEFAULT 0,
        carbs_g REAL DEFAULT 0,
        fat_g REAL DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 训练日志表
    CREATE TABLE IF NOT EXISTS training_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        training_type TEXT NOT NULL CHECK (training_type IN ('boxing_strength', 'strength_cardio', 'boxing', 'strength', 'cardio', 'rest')),
        focus_area TEXT,
        duration_min INTEGER DEFAULT 0,
        estimated_calories INTEGER DEFAULT 0,
        superset_rounds INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 每日饮食汇总视图
    CREATE VIEW IF NOT EXISTS daily_diet_summary AS
    SELECT 
        date,
        SUM(calories) as total_calories,
        SUM(protein_g) as total_protein,
        SUM(carbs_g) as total_carbs,
        SUM(fat_g) as total_fat,
        COUNT(DISTINCT meal_type) as meal_count
    FROM diet_log
    WHERE meal_type != 'summary'
    GROUP BY date;

    -- 每日训练汇总视图
    CREATE VIEW IF NOT EXISTS daily_training_summary AS
    SELECT 
        date,
        SUM(estimated_calories) as total_cal_out,
        GROUP_CONCAT(DISTINCT training_type) as training_types,
        SUM(duration_min) as total_duration
    FROM training_log
    GROUP BY date;

    -- 每日完整汇总视图
    CREATE VIEW IF NOT EXISTS daily_summary AS
    SELECT 
        w.date,
        w.weight_kg,
        w.bodyfat_pct,
        COALESCE(d.total_calories, 0) as calories_in,
        COALESCE(t.total_cal_out, 0) as calories_out,
        COALESCE(d.total_protein, 0) as protein_g,
        COALESCE(d.total_carbs, 0) as carbs_g,
        COALESCE(d.total_fat, 0) as fat_g,
        COALESCE(d.total_calories, 0) - COALESCE(t.total_cal_out, 0) as net_calories,
        t.training_types,
        t.total_duration
    FROM weight_log w
    LEFT JOIN daily_diet_summary d ON w.date = d.date
    LEFT JOIN daily_training_summary t ON w.date = t.date;

    -- 趋势计算视图（含7日移动平均）
    CREATE VIEW IF NOT EXISTS weight_trend AS
    SELECT 
        date,
        weight_kg,
        ROUND(AVG(weight_kg) OVER (ORDER BY date ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING), 2) as smooth_weight,
        weight_kg - LAG(weight_kg, 1) OVER (ORDER BY date) as daily_change,
        weight_kg - LAG(weight_kg, 7) OVER (ORDER BY date) as weekly_change,
        ROUND((weight_kg - LAG(weight_kg, 7) OVER (ORDER BY date)) / 7.0 * 7700, 0) as implied_weekly_deficit
    FROM weight_log;

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_weight_date ON weight_log(date);
    CREATE INDEX IF NOT EXISTS idx_diet_date ON diet_log(date);
    CREATE INDEX IF NOT EXISTS idx_training_date ON training_log(date);
    CREATE INDEX IF NOT EXISTS idx_diet_meal ON diet_log(date, meal_type);
    """


def init_database(config=None):
    """初始化数据库和配置"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.executescript(get_schema())
    
    # 插入或更新用户配置
    if config:
        cursor.execute("""
            INSERT OR REPLACE INTO user_config 
            (id, start_date, start_weight_kg, target_weight_kg, daily_cal_target,
             protein_target_g, fat_target_g, carbs_target_g, bmr_kcal, activity_factor,
             weekly_deficit_kcal, notes)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            config["start_date"],
            config["start_weight_kg"],
            config["target_weight_kg"],
            config["daily_cal_target"],
            config["protein_target_g"],
            config["fat_target_g"],
            config["carbs_target_g"],
            config["bmr_kcal"],
            config["activity_factor"],
            config["weekly_deficit_kcal"],
            config.get("notes", "")
        ))
    
    conn.commit()
    conn.close()
    print(f"Database initialized: {DB_PATH}")
    return DB_PATH


def get_default_config():
    """返回刘昊的默认减脂配置"""
    return {
        "start_date": "2026-06-17",
        "start_weight_kg": 74.30,
        "target_weight_kg": 65.0,
        "daily_cal_target": 1650,
        "protein_target_g": 150,
        "fat_target_g": 60,
        "carbs_target_g": 125,
        "bmr_kcal": 1629,
        "activity_factor": 1.55,
        "weekly_deficit_kcal": 5400,
        "notes": "方案二-标准减脂：周减约0.7kg，预计13周达标。训练日1760kcal，休息日1190kcal。"
    }


if __name__ == "__main__":
    config = get_default_config()
    init_database(config)
    print("User config applied:")
    for k, v in config.items():
        print(f"  {k}: {v}")
