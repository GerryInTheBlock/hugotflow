"""HugotFlow recommendation service (Chapter 3: Python 3.10+, FastAPI, scikit-learn).

Iteration 0 ships the service shell so the app and the Engine Monitoring screen (Fig 17)
can connect to it. The C4.5-style decision tree (DecisionTreeClassifier, criterion="entropy")
is trained and wired into /recommend in Iteration 4.
"""

from __future__ import annotations

import time
from enum import Enum

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_VERSION = "not-trained"
STARTED_AT = time.time()

app = FastAPI(title="HugotFlow Recommender", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the deployed web console URL before go-live
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class Goal(str, Enum):
    strength = "strength"
    weight_loss = "weight_loss"
    general_wellness = "general_wellness"


class Experience(str, Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class Severity(str, Enum):
    none = "none"
    mild = "mild"
    moderate = "moderate"
    severe = "severe"


JOINTS = {"knee", "lower_back", "shoulder", "hip", "ankle", "wrist_elbow"}


class RecommendRequest(BaseModel):
    user_id: str
    age: int = Field(ge=16, le=100)
    bmi: float = Field(gt=10, lt=70)
    fitness_goal: Goal
    experience_level: Experience
    joint_conditions: list[str] = []
    severity: Severity = Severity.none
    daily_status: str = "good"  # good | soreness | pain


@app.get("/health")
def health() -> dict:
    """Status for Fig 17: service up, uptime, model version."""
    return {"status": "online", "uptime_s": round(time.time() - STARTED_AT), "model_version": MODEL_VERSION}


@app.get("/model")
def model_info() -> dict:
    return {"model_version": MODEL_VERSION, "criterion": "entropy", "trained": False}


@app.post("/recommend")
def recommend(req: RecommendRequest) -> dict:
    unknown = set(req.joint_conditions) - JOINTS
    if unknown:
        return {"error": f"Unsupported conditions: {sorted(unknown)}. Allowed: {sorted(JOINTS)}"}
    # Severity gate (Fig 18): a severe constraint always raises an instructor alert.
    high_risk = req.severity == Severity.severe or req.daily_status == "pain"
    return {
        "model_version": MODEL_VERSION,
        "instructor_alert": high_risk,
        "predicted_class": None,
        "routine": [],
        "note": "Decision tree not trained yet (Iteration 4).",
    }
