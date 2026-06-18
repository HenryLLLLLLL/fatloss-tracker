-- FatLoss Tracker - Supabase Database Schema
-- Copy-paste into Supabase SQL Editor to initialize

-- 1. Weight log (16 body composition fields)
CREATE TABLE IF NOT EXISTS weight_log (
  id          BIGSERIAL PRIMARY KEY,
  date        DATE NOT NULL,
  weight_kg   NUMERIC(5,2) NOT NULL,
  bmi         NUMERIC(4,1),
  bodyfat_pct NUMERIC(4,1),
  bmr_kcal    INTEGER,
  fat_mass_kg           NUMERIC(5,2),
  lean_mass_kg          NUMERIC(5,2),
  muscle_kg             NUMERIC(5,2),
  muscle_rate_pct       NUMERIC(4,1),
  skeletal_muscle_rate  NUMERIC(4,1),
  bone_mass_kg          NUMERIC(3,2),
  protein_rate          NUMERIC(4,1),
  body_water_rate       NUMERIC(4,1),
  body_water_kg         NUMERIC(5,2),
  subcutaneous_fat_rate NUMERIC(4,1),
  visceral_fat_level    INTEGER,
  body_age              INTEGER,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date)
);

-- 2. Diet log
CREATE TABLE IF NOT EXISTS diet_log (
  id          BIGSERIAL PRIMARY KEY,
  date        DATE NOT NULL,
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack','supplement','summary')),
  food        TEXT NOT NULL,
  calories    INTEGER DEFAULT 0,
  protein_g   NUMERIC(5,1) DEFAULT 0,
  carbs_g     NUMERIC(5,1) DEFAULT 0,
  fat_g       NUMERIC(5,1) DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. Training log
CREATE TABLE IF NOT EXISTS training_log (
  id                 BIGSERIAL PRIMARY KEY,
  date               DATE NOT NULL,
  training_type      TEXT NOT NULL CHECK (training_type IN ('boxing_strength','strength_cardio','boxing','strength','cardio','rest')),
  focus_area         TEXT CHECK (focus_area IN ('upper','lower','back','chest','full_body','')),
  duration_min       INTEGER DEFAULT 0,
  estimated_calories INTEGER DEFAULT 0,
  superset_rounds    INTEGER DEFAULT 0,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 4. User config (single user)
CREATE TABLE IF NOT EXISTS user_config (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  target_weight_kg  NUMERIC(5,2) DEFAULT 65.0,
  target_bodyfat_pct NUMERIC(4,1) DEFAULT 15.0,
  bmr_kcal          INTEGER DEFAULT 1629,
  daily_cal_target  INTEGER DEFAULT 1650,
  protein_target_g  INTEGER DEFAULT 150,
  fat_target_g      INTEGER DEFAULT 60,
  carbs_target_g    INTEGER DEFAULT 125,
  start_date        DATE DEFAULT '2026-06-17',
  start_weight_kg   NUMERIC(5,2) DEFAULT 74.30,
  start_bodyfat_pct NUMERIC(4,1) DEFAULT 23.1,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

INSERT INTO user_config DEFAULT VALUES
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE weight_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_config ENABLE ROW LEVEL SECURITY;

-- Public access policy (single-user personal app)
CREATE POLICY "allow_all_weight" ON weight_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_diet" ON diet_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_training" ON training_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_config" ON user_config FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weight_date ON weight_log(date DESC);
CREATE INDEX IF NOT EXISTS idx_diet_date ON diet_log(date DESC);
CREATE INDEX IF NOT EXISTS idx_training_date ON training_log(date DESC);
