"""
Food calorie estimation engine using DeepSeek API + local food database.

Two-tier approach:
1. Local food_db.json lookup for known foods (instant, zero cost)
2. DeepSeek API for complex/unknown descriptions (intelligent, ~¥0.001/call)
"""
import json
import re
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional


# Load local food database
_food_db_path = Path(__file__).parent / "food_db.json"
with open(_food_db_path, encoding="utf-8") as f:
    FOOD_DB = json.load(f)


MEAL_TYPE_MAP = {
    "早饭": "breakfast", "早餐": "breakfast", "早上": "breakfast",
    "morning": "breakfast", "breakfast": "breakfast",
    "午饭": "lunch", "午餐": "lunch", "中午": "lunch",
    "lunch": "lunch", "中饭": "lunch",
    "晚饭": "dinner", "晚餐": "dinner", "晚上": "dinner",
    "dinner": "dinner", "supper": "dinner",
    "零食": "snack", "加餐": "snack", "下午茶": "snack",
    "snack": "snack", "夜宵": "snack",
    "补剂": "supplement", "supplement": "supplement",
    "蛋白粉": "supplement",
}


def detect_meal_type(text: str) -> str:
    """Detect meal type from text."""
    text_lower = text.lower()
    for keyword, meal_type in MEAL_TYPE_MAP.items():
        if keyword in text_lower:
            return meal_type
    # Default: guess by time
    return "snack"


def local_lookup(food_name: str) -> Optional[dict]:
    """Look up food in local database. Returns None if not found."""
    defaults = FOOD_DB.get("defaults", {})
    aggregates = FOOD_DB.get("meal_aggregates", {})

    # Exact match
    if food_name in defaults:
        return defaults[food_name]
    if food_name in aggregates:
        return aggregates[food_name]

    # Fuzzy match: find the longest keyword that appears in food_name
    best_match = None
    best_len = 0
    for name in {**defaults, **aggregates}:
        if name in food_name and len(name) > best_len:
            best_match = name
            best_len = len(name)

    if best_match:
        merged = {**defaults, **aggregates}
        return merged[best_match]

    return None


def parse_quantity(text: str) -> float:
    """Extract quantity from text. Returns 1.0 as default."""
    # Match patterns like "2个", "200g", "1碗", "半碗", "一份"
    patterns = [
        (r'(\d+(?:\.\d+)?)\s*(?:个|份|碗|杯|勺|盘|盒|顿|根|片|罐|斤|两|克|g|ml)', 1.0),
        (r'([半])\s*(?:个|份|碗|杯|勺)', 0.5),
        (r'([一两])\s*份', 1.0),
        (r'([两三])\s*份', 2.5),
    ]

    for pattern, multiplier in patterns:
        m = re.search(pattern, text)
        if m:
            if m.group(1) == '半':
                return 0.5
            try:
                return float(m.group(1)) * multiplier
            except ValueError:
                pass
    return 1.0


def parse_nutrition_local(food_text: str) -> Optional[dict]:
    """
    Parse a single food item using local database only.
    Returns {"food", "calories", "protein_g", "carbs_g", "fat_g"} or None.
    """
    item = local_lookup(food_text)
    if not item:
        return None

    qty = parse_quantity(food_text)
    return {
        "food": food_text.strip(),
        "calories": round(item["calories"] * qty, 1),
        "protein_g": round(item["protein_g"] * qty, 1),
        "carbs_g": round(item["carbs_g"] * qty, 1),
        "fat_g": round(item["fat_g"] * qty, 1),
        "source": "local",
    }


def parse_with_deepseek(meal_text: str, api_key: str, base_url: str, model: str) -> dict:
    """
    Use DeepSeek API to parse natural language meal description.
    Returns structured nutrition data.
    """
    if not api_key:
        raise ValueError("DeepSeek API key not configured")

    system_prompt = """你是一个专业的营养师和饮食热量分析助手。用户会用自然语言描述吃了一顿饭，你需要：

1. 识别餐次类型：breakfast/lunch/dinner/snack/supplement
2. 识别食物内容（简短描述）
3. 估算热量(calories,千卡)和营养素(protein_g 蛋白质克数, carbs_g 碳水克数, fat_g 脂肪克数)

估算要点：
- 食堂一份盖饭/快餐约600-800千卡，蛋白25-35g
- 一碗米饭(约150g)约200千卡
- 一份炒菜约100-200千卡
- 鸡胸肉100g约133千卡/31g蛋白
- 一碗面条约280千卡
- 一杯奶茶约300千卡
- 一瓶可乐约140千卡

输出格式：纯JSON，不要markdown，不要解释：
{"meal_type":"lunch","food":"红烧牛肉面","calories":650,"protein_g":28,"carbs_g":75,"fat_g":22,"notes":"食堂份量，偏油"}"""

    req_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"请分析这顿饭：{meal_text}"},
        ],
        "temperature": 0.1,
        "max_tokens": 300,
        "response_format": {"type": "json_object"},
    }

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(req_body).encode(),
        headers=headers,
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            content = result["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            parsed["source"] = "deepseek"
            return parsed
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else str(e)
        raise RuntimeError(f"DeepSeek API error {e.code}: {err_body}")


# Complex meal indicators - if any of these appear, route to DeepSeek
COMPLEX_SEPARATORS = ["和", "加", "还有", "跟", "配", "再加", "另加", "加上",
                      "还有", "以及", "外加", "搭配", "另外", "然后", "之后"]
COMPLEX_PUNCTUATION = [",", "，", "、", "。", "；", ";"]


def _is_complex_meal(text: str) -> bool:
    """Detect if text describes multiple food items (complex meal)."""
    # Check for separators
    for sep in COMPLEX_SEPARATORS:
        if sep in text:
            return True
    for punct in COMPLEX_PUNCTUATION:
        if punct in text:
            return True

    # Count known food items in text
    defaults = FOOD_DB.get("defaults", {})
    aggregates = FOOD_DB.get("meal_aggregates", {})
    all_foods = {**defaults, **aggregates}
    food_count = sum(1 for name in all_foods if name in text)

    # More than 2 known foods = complex
    if food_count >= 2:
        return True

    return False


def parse_meal(meal_text: str, api_key: str = "",
               base_url: str = "https://api.deepseek.com/v1",
               model: str = "deepseek-chat") -> dict:
    """
    Parse a meal from natural language text.
    Returns: {
        "meal_type": str,
        "food": str,
        "calories": float,
        "protein_g": float,
        "carbs_g": float,
        "fat_g": float,
        "notes": str,
        "source": "local" | "deepseek"
    }
    """
    # Step 1: Simple meal (single food) -> use local DB
    if not _is_complex_meal(meal_text):
        local_result = parse_nutrition_local(meal_text)
        if local_result:
            result = {
                "meal_type": detect_meal_type(meal_text),
                "food": local_result["food"],
                "calories": local_result["calories"],
                "protein_g": local_result["protein_g"],
                "carbs_g": local_result["carbs_g"],
                "fat_g": local_result["fat_g"],
                "notes": "",
                "source": "local",
            }
            return result

    # Step 2: Complex meal or no local match -> DeepSeek API
    if not api_key:
        return {
            "meal_type": detect_meal_type(meal_text),
            "food": meal_text[:50],
            "calories": 500,
            "protein_g": 20,
            "carbs_g": 50,
            "fat_g": 20,
            "notes": "(DeepSeek未配置，数值为粗略估算，建议手动修正)",
            "source": "fallback",
        }

    result = parse_with_deepseek(meal_text, api_key, base_url, model)
    return result
