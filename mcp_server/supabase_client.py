"""
Supabase REST API client for FatLoss MCP server.
Uses raw HTTP requests (no supabase-js) for maximum portability.
"""
import json
import urllib.request
import urllib.error
from typing import Optional


class SupabaseClient:
    """Minimal Supabase REST API client."""

    def __init__(self, url: str, anon_key: str):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self._headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _request(self, method: str, path: str, data: Optional[dict] = None) -> list | dict:
        url = f"{self.url}/rest/v1/{path}"
        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=self._headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                content = resp.read().decode()
                return json.loads(content) if content else []
        except urllib.error.HTTPError as e:
            err_body = e.read().decode() if e.fp else str(e)
            raise RuntimeError(f"Supabase HTTP {e.code}: {err_body}")

    # ── Weight ──

    def log_weight(self, date: str, data: dict) -> dict:
        """Upsert weight record. `data` should contain at least weight_kg."""
        data["date"] = date
        path = f'weight_log?on_conflict=date'
        return self._request("POST", path, data)

    def get_weight(self, date: str) -> Optional[dict]:
        rows = self._request("GET", f'weight_log?date=eq.{date}&limit=1')
        return rows[0] if rows else None

    def get_weight_history(self, limit: int = 30) -> list:
        return self._request("GET", f'weight_log?order=date.asc&limit={limit}')

    # ── Diet ──

    def log_meal(self, date: str, meal_type: str, food: str,
                 calories: float, protein_g: float, carbs_g: float,
                 fat_g: float, notes: str = "") -> dict:
        data = {
            "date": date,
            "meal_type": meal_type,
            "food": food,
            "calories": int(round(calories)),
            "protein_g": round(protein_g, 1),
            "carbs_g": round(carbs_g, 1),
            "fat_g": round(fat_g, 1),
            "notes": notes or "",
        }
        return self._request("POST", "diet_log", data)

    def get_today_diet(self, date: str) -> list:
        return self._request("GET", f'diet_log?date=eq.{date}&order=created_at.asc')

    def get_diet_history(self, limit: int = 30) -> list:
        return self._request("GET", f'diet_log?order=created_at.desc&limit={limit}')

    # ── Training ──

    def log_training(self, date: str, training_type: str,
                     duration_min: float, estimated_calories: float,
                     focus_area: str = "", notes: str = "") -> dict:
        data = {
            "date": date,
            "training_type": training_type,
            "duration_min": round(duration_min, 1),
            "estimated_calories": int(round(estimated_calories)),
            "focus_area": focus_area or None,
            "notes": notes or None,
        }
        path = f'training_log?on_conflict=date,training_type'
        return self._request("POST", path, data)

    def get_today_training(self, date: str) -> list:
        return self._request("GET", f'training_log?date=eq.{date}&order=created_at.asc')

    # ── User Config ──

    def get_config(self) -> Optional[dict]:
        rows = self._request("GET", "user_config?id=eq.1&limit=1")
        return rows[0] if rows else None
