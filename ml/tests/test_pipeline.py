"""ML checks (run from the repo root:  python -m pytest ml services/recommender)."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))
sys.path.insert(0, str(ROOT / "services" / "recommender"))

from app.features import COLUMNS, build_row  # noqa: E402
from generate_dataset import generate  # noqa: E402
from labels import CLASSES, label  # noqa: E402

ALL = {"racks_available": 1, "cardio_available": 1, "cables_available": 1, "machines_available": 1, "free_weights_available": 1}


def row(**kw):
    base = dict(age=25, bmi=24.0, goal="strength", experience="beginner", conditions=[], severity="none", daily_status="good", available=ALL)
    base.update(kw)
    return build_row(**base)


def test_rules_examples():
    assert label(row()) == "Strength-Standard"
    assert label(row(conditions=["knee"], severity="moderate")) == "Strength-Modified-Lower"
    assert label(row(conditions=["shoulder"], severity="severe")) == "Strength-Modified-Upper"
    assert label(row(conditions=["knee"], severity="mild")) == "Strength-Standard"  # mild: standard, joint filter only
    assert label(row(daily_status="pain")) == "Wellness-Mobility"
    assert label(row(goal="weight_loss", bmi=34)) == "WeightLoss-LowImpact"
    assert label(row(goal="weight_loss")) == "WeightLoss-Standard"
    assert label(row(goal="general_wellness", age=65)) == "Wellness-Mobility"


def test_dataset_is_reproducible_and_covers_every_class():
    a, b = generate(500, 7), generate(500, 7)
    assert a == b
    rows = generate(3000, 42)
    assert {r["program"] for r in rows} == set(CLASSES)
    assert all(list(r)[: len(COLUMNS)] == COLUMNS for r in rows)
    agree = sum(r["program"] == label(r) for r in rows) / len(rows)
    assert 0.95 <= agree <= 0.99  # about 3% coach-disagreement noise


def test_trained_model_if_present():
    model_dir = ROOT / "services" / "recommender" / "model"
    if not (model_dir / "model.joblib").exists():
        return  # run ml/train.py first
    import joblib
    import pandas as pd

    model = joblib.load(model_dir / "model.joblib")
    card = json.loads((model_dir / "model_card.json").read_text(encoding="utf-8"))
    assert card["test_metrics"]["f1_macro"] >= 0.85
    pred = model.predict(pd.DataFrame([row(conditions=["knee"], severity="moderate")]))[0]
    assert pred == "Strength-Modified-Lower"
