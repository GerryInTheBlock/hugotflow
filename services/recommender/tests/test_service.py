"""Service tests with a fake Supabase (no network). Run from the repo root:  python -m pytest ml services/recommender

A small model is trained on the synthetic dataset for the test, so these run before ml/train.py has been used.
"""

import sys
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services" / "recommender"))
sys.path.insert(0, str(ROOT / "ml"))

import json  # noqa: E402

import pandas as pd  # noqa: E402

from app import engine, main  # noqa: E402
from app.features import COLUMNS  # noqa: E402
from generate_dataset import generate  # noqa: E402
from train import make_pipeline  # noqa: E402

CATALOGUE = json.loads((ROOT / "ml" / "catalogue.json").read_text(encoding="utf-8"))["exercises"]
SEED_EQUIPMENT = [
    ("Power Rack", "Racks & Benches"), ("Smith Machine Bench Press", "Chest"), ("Kettlebells", "Free Weights"),
    ("Rubber Hex Dumbbells", "Free Weights"), ("Leg Press", "Legs & Glutes"), ("Leg Extension", "Legs & Glutes"),
    ("Adjustable Dumbbells", "Free Weights"), ("Hip Adductor", "Legs & Glutes"), ("Seated Leg Curl", "Legs & Glutes"),
    ("Stability Ball", "Core / Abs"), ("Deadlift Bar", "Free Weights"), ("Olympic Barbell", "Free Weights"),
    ("Hip Thrust Machine", "Legs & Glutes"), ("Cable Kickback", "Legs & Glutes"), ("Olympic Bench", "Racks & Benches"),
    ("Flat Bench", "Racks & Benches"), ("Chest Press Machine", "Chest"), ("Incline Chest Press", "Chest"),
    ("Cable Fly", "Chest"), ("Cable Crossover", "Cable / Pull Machines"), ("Assisted Pull-Up/Dip Machine", "Back"),
    ("Shoulder Press Machine", "Shoulders"), ("Adjustable Bench", "Racks & Benches"), ("Lateral Raise Machine", "Shoulders"),
    ("Rear Delt / Reverse Fly", "Shoulders"), ("Dual Adjustable Pulley", "Cable / Pull Machines"),
    ("Seated Cable Row", "Cable / Pull Machines"), ("Chest-Supported Row", "Back"), ("Plate-Loaded Row", "Back"),
    ("T-Bar Row", "Back"), ("Lat Pulldown", "Cable / Pull Machines"), ("EZ Curl Bar", "Free Weights"),
    ("Single Pulley Machine", "Cable / Pull Machines"), ("Triceps Bar", "Cable / Pull Machines"),
    ("Tatami Mats", "Jiu-Jitsu / Martial Arts"), ("Grappling Mats", "Jiu-Jitsu / Martial Arts"), ("Ab Wheel", "Core / Abs"),
    ("Decline Sit-Up Bench", "Core / Abs"), ("Electric Treadmill", "Cardio"), ("Curved Treadmill", "Cardio"),
    ("Spin Bike", "Cardio"), ("Stationary Bike", "Cardio"), ("Rowing Machine", "Cardio"), ("Jump Ropes", "Muay Thai / Boxing"),
    ("Agility Ladder", "Jiu-Jitsu / Martial Arts"), ("Heavy Bag", "Muay Thai / Boxing"), ("Muay Thai Heavy Bag", "Muay Thai / Boxing"),
]


def equipment_rows(out_of_order=()):
    return [{"equipment_id": i + 1, "name": n, "category": c, "maintenance_status": "out_of_order" if n in out_of_order else "available"}
            for i, (n, c) in enumerate(SEED_EQUIPMENT)]


def exercise_rows():
    ids = {n: i + 1 for i, (n, _) in enumerate(SEED_EQUIPMENT)}
    return [{**e, "equipment_id": ids[e["equipment"]]} for e in CATALOGUE]


@pytest.fixture(scope="module")
def model():
    rows = generate(3000, 42)
    df = pd.DataFrame(rows)
    m = make_pipeline()
    m.set_params(tree__max_depth=10, tree__min_samples_leaf=5)
    m.fit(df[COLUMNS], df["program"])
    return m


def run(model, *, conditions=(), severity="none", goal="strength", experience="beginner", daily=None, birthdate="2000-01-01",
        consent=True, out_of_order=(), user_id="member-1"):
    profile = {"bmi": 24.5, "fitness_goal": goal, "experience_level": experience, "joint_conditions": list(conditions),
               "severity": severity, "consent_verified": consent}
    return engine.recommend(model, profile=profile, user={"user_id": user_id, "birthdate": birthdate}, daily=daily,
                            equipment_rows=equipment_rows(out_of_order), exercise_rows=exercise_rows(), today=date(2026, 11, 2))


def test_knee_gets_modified_plan_and_skips_back_squat(model):
    r = run(model, conditions=["knee"], severity="moderate")
    assert r.program == "Strength-Modified-Lower"
    names = [i["name"] for i in r.routine]
    assert "Barbell back squat" not in names and ("Goblet Squat" in names or "Leg press" in names)
    assert any(s["name"] == "Barbell back squat" and s["reason"] == "Knee constraint" for s in r.skipped)
    assert not r.alert


def test_severe_condition_raises_alert(model):
    r = run(model, conditions=["knee"], severity="severe")
    assert r.alert and r.alert_summary == "Severe knee condition"
    assert r.program.startswith("Strength-Modified")
    assert all(i["code"] not in ("treadmill_intervals", "jump_rope") for i in r.routine)


def test_pain_today_raises_alert_and_mobility(model):
    r = run(model, goal="weight_loss", daily={"status": "pain", "body_area": "Lower back"})
    assert r.alert and "Lower back" in r.alert_summary
    assert r.program == "Wellness-Mobility"


def test_out_of_order_machine_is_never_used(model):
    r = run(model, goal="general_wellness", out_of_order=("Leg Press", "Chest Press Machine"))
    used = {i["equipment"] for i in r.routine}
    assert "Leg Press" not in used and "Chest Press Machine" not in used
    assert "Leg Press" in r.excluded_equipment


def test_minor_without_consent_is_locked(model):
    with pytest.raises(engine.Locked):
        run(model, conditions=["knee"], severity="moderate", birthdate="2010-01-01", consent=False)


def test_decision_path_and_dosage(model):
    r = run(model, experience="advanced")
    assert r.decision_path and all({"feature", "op", "threshold"} <= set(s) for s in r.decision_path)
    lifts = [i for i in r.routine if i.get("reps")]
    assert lifts and all(i["sets"] == 4 and i["reps"] == "12" for i in lifts)  # advanced: 4 × 12–15


class FakeStore:
    configured = True

    def __init__(self, role="member"):
        self.role = role
        self.saved = None

    def user_from_token(self, token):
        return {"user_id": "me", "role": self.role} if token == "good" else None

    def user(self, uid):
        return {"user_id": uid, "birthdate": "2000-01-01"}

    def profile(self, uid):
        return {"bmi": 24, "fitness_goal": "strength", "experience_level": "beginner", "joint_conditions": ["knee"], "severity": "moderate", "consent_verified": False}

    def daily(self, uid, day):
        return None

    def equipment(self):
        return equipment_rows()

    def exercises(self):
        return exercise_rows()

    def record(self, **kw):
        self.saved = kw
        return {"recommendation_id": "rec-1", "alert_id": None}


def test_endpoint_auth_and_save(model, monkeypatch):
    monkeypatch.setattr(main, "MODEL", model)
    fake = FakeStore()
    main.app.dependency_overrides[main.get_store] = lambda: fake
    client = TestClient(main.app)
    assert client.post("/recommend", json={}).status_code == 401
    assert client.post("/recommend", json={"user_id": "someone-else"}, headers={"Authorization": "Bearer good"}).status_code == 403
    res = client.post("/recommend", json={}, headers={"Authorization": "Bearer good"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["recommendation_id"] == "rec-1" and body["program"] == "Strength-Modified-Lower"
    assert fake.saved["p_user_id"] == "me" and fake.saved["p_class"] == body["program"]
    main.app.dependency_overrides.clear()


def test_equal_choices_spread_across_members_but_stay_fixed_for_one(model):
    squats = {next(i["name"] for i in run(model, conditions=["knee"], severity="moderate", user_id=f"m{k}").routine if i["pattern"] == "squat") for k in range(20)}
    assert squats == {"Goblet Squat", "Leg press"}  # both equally safe options get used
    a = run(model, conditions=["knee"], severity="moderate", user_id="m7").routine
    b = run(model, conditions=["knee"], severity="moderate", user_id="m7").routine
    assert a == b  # the same member gets the same plan all day
