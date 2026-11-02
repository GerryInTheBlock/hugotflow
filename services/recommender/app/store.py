"""Supabase access for the recommender, using the REST API with the server key.

The service role key is read from the environment (SUPABASE_SERVICE_ROLE_KEY) on the host only; it is never
in the repository or the app. Members prove who they are with their own login token, which is checked with
Supabase Auth before anything is read.
"""

from __future__ import annotations

import os

import httpx


class Store:
    def __init__(self, url: str | None = None, key: str | None = None):
        self.url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
        self.key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.http = httpx.Client(timeout=15)

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def _h(self, **extra) -> dict:
        return {"apikey": self.key, "Authorization": f"Bearer {self.key}", **extra}

    def _get(self, table: str, params: dict) -> list[dict]:
        r = self.http.get(f"{self.url}/rest/v1/{table}", params=params, headers=self._h())
        r.raise_for_status()
        return r.json()

    # -- who is calling
    def user_from_token(self, token: str) -> dict | None:
        r = self.http.get(f"{self.url}/auth/v1/user", headers={"apikey": self.key, "Authorization": f"Bearer {token}"})
        if r.status_code != 200:
            return None
        uid = r.json().get("id")
        rows = self._get("users", {"user_id": f"eq.{uid}", "select": "user_id,role,is_active,full_name,birthdate"})
        return rows[0] if rows and rows[0].get("is_active") else None

    # -- inputs
    def user(self, user_id: str) -> dict | None:
        rows = self._get("users", {"user_id": f"eq.{user_id}", "select": "user_id,full_name,birthdate,role"})
        return rows[0] if rows else None

    def profile(self, user_id: str) -> dict | None:
        rows = self._get("health_profiles", {"user_id": f"eq.{user_id}", "select": "*"})
        return rows[0] if rows else None

    def daily(self, user_id: str, day: str) -> dict | None:
        rows = self._get("daily_status", {"user_id": f"eq.{user_id}", "status_date": f"eq.{day}", "select": "status,body_area,note"})
        return rows[0] if rows else None

    def equipment(self) -> list[dict]:
        return self._get("equipment", {"select": "equipment_id,name,category,maintenance_status"})

    def exercises(self) -> list[dict]:
        return self._get("exercises", {"select": "code,name,equipment_id,pattern,impact,contraindicated,cue,substitutes", "code": "not.is.null"})

    # -- output
    def record(self, **payload) -> dict:
        r = self.http.post(f"{self.url}/rest/v1/rpc/record_recommendation", json=payload, headers=self._h(**{"Content-Type": "application/json"}))
        r.raise_for_status()
        return r.json()
