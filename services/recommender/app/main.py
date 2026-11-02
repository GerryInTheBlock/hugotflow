"""HugotFlow recommendation service (Chapter 3: Python 3.10+, FastAPI, scikit-learn).

Endpoints
  GET  /health     status, uptime and model version (Engine Monitoring, Fig 17)
  GET  /model      model card: parameters, test metrics, IF-THEN rules
  POST /recommend  builds today's safe plan for a member (Fig 18); body {"user_id": optional}
                   Authorization: Bearer <the caller's Supabase login token>
                   Members may only ask for themselves; instructors and the owner may ask for any member.

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (host settings only), ALLOWED_ORIGINS (comma-separated, optional).
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .engine import PROGRAMS, Locked, recommend
from .store import Store

MODEL_DIR = Path(__file__).resolve().parents[1] / "model"
STARTED_AT = time.time()
MANILA = timezone(timedelta(hours=8))

app = FastAPI(title="HugotFlow Recommender", version="1.0.0")
origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()] or [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["*"])


def load_model():
    path = MODEL_DIR / "model.joblib"
    card_path = MODEL_DIR / "model_card.json"
    if not path.exists():
        return None, {"version": "not-trained"}
    return joblib.load(path), json.loads(card_path.read_text(encoding="utf-8"))


MODEL, CARD = load_model()
_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store


class RecommendRequest(BaseModel):
    user_id: str | None = None


@app.get("/health")
def health():
    return {
        "status": "ok" if MODEL is not None else "model-missing",
        "model_version": CARD.get("version"),
        "trained_at": CARD.get("trained_at"),
        "uptime_s": int(time.time() - STARTED_AT),
    }


@app.get("/model")
def model_card():
    return CARD


@app.post("/recommend")
def recommend_endpoint(body: RecommendRequest, authorization: str = Header(default=""), store: Store = Depends(get_store)):
    started = time.perf_counter()
    if MODEL is None:
        raise HTTPException(503, "The recommendation model is not trained yet.")
    if not store.configured:
        raise HTTPException(503, "The service is missing its Supabase settings.")
    token = authorization.removeprefix("Bearer ").strip()
    caller = store.user_from_token(token) if token else None
    if not caller:
        raise HTTPException(401, "Sign in again.")
    target = body.user_id or caller["user_id"]
    if target != caller["user_id"] and caller["role"] not in ("instructor", "admin"):
        raise HTTPException(403, "You can only get a plan for yourself.")

    today = datetime.now(MANILA).date()
    user = store.user(target)
    if not user:
        raise HTTPException(404, "Member not found.")
    profile = store.profile(target)
    daily = store.daily(target, today.isoformat())
    try:
        result = recommend(MODEL, profile=profile, user=user, daily=daily, equipment_rows=store.equipment(),
                           exercise_rows=store.exercises(), today=today)
    except Locked as e:
        raise HTTPException(409, str(e)) from e

    latency = int((time.perf_counter() - started) * 1000)
    saved = store.record(
        p_user_id=target,
        p_class=result.program,
        p_routine=result.routine,
        p_skipped=result.skipped,
        p_decision_path=result.decision_path,
        p_features=result.features,
        p_model_version=CARD.get("version"),
        p_alert=result.alert,
        p_alert_summary=result.alert_summary,
        p_latency_ms=latency,
    )
    spec = PROGRAMS[result.program]
    return {
        "recommendation_id": saved.get("recommendation_id"),
        "alert_id": saved.get("alert_id"),
        "program": result.program,
        "goal": spec["goal"],
        "modified": spec["modified"],
        "minutes": result.minutes,
        "usable_equipment": result.usable_equipment,
        "excluded_equipment": result.excluded_equipment,
        "routine": result.routine,
        "skipped": result.skipped,
        "alert": result.alert,
        "alert_summary": result.alert_summary,
        "decision_path": result.decision_path,
        "model_version": CARD.get("version"),
        "latency_ms": latency,
        "note": "Recommendations are suggestions. Stop any exercise that causes pain and tell the instructor.",
    }
