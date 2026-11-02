"""Synthetic, rule-labelled training set (Build Plan §6 step 2).

The paper states the dataset is built from exercise rules, the instructors' usual programs and the equipment
guides in Appendix 2, and *not* from real member data. Profiles are sampled to look like a neighbourhood gym's
members; each one is labelled by ml/labels.py. A small share (3%) of labels is moved to a neighbouring class to
reflect that two coaches do not always choose the same program; the tree then has to generalise rather than
memorise.

Run:  python ml/generate_dataset.py            → ml/data/training.csv (3,000 rows, seed 42)
"""

from __future__ import annotations

import argparse
import csv
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "recommender"))
sys.path.insert(0, str(ROOT / "ml"))
from app.features import COLUMNS, EQUIPMENT_GROUPS, JOINTS, build_row  # noqa: E402
from labels import NEIGHBOURS, label  # noqa: E402

NOISE = 0.03


def sample_profile(rng: random.Random) -> dict:
    age = int(min(70, max(16, rng.gauss(30, 11))))
    bmi = round(min(42, max(16, rng.gauss(25.5, 4.5))), 1)
    goal = rng.choices(["strength", "weight_loss", "general_wellness"], weights=[0.4, 0.35, 0.25])[0]
    experience = rng.choices(["beginner", "intermediate", "advanced"], weights=[0.5, 0.3, 0.2])[0]
    conditions: list[str] = []
    if rng.random() < 0.45:
        conditions = rng.sample(JOINTS, k=rng.choices([1, 2], weights=[0.8, 0.2])[0])
    severity = "none" if not conditions else rng.choices(["mild", "moderate", "severe"], weights=[0.35, 0.4, 0.25])[0]
    daily = rng.choices(["good", "soreness", "pain"], weights=[0.72, 0.2, 0.08])[0]
    available = {f"{g}_available": int(rng.random() < 0.9) for g in EQUIPMENT_GROUPS}
    return build_row(age=age, bmi=bmi, goal=goal, experience=experience, conditions=conditions,
                     severity=severity, daily_status=daily, available=available)


def generate(n: int = 3000, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for _ in range(n):
        row = sample_profile(rng)
        cls = label(row)
        if rng.random() < NOISE:
            cls = rng.choice(NEIGHBOURS[cls])
        row["program"] = cls
        rows.append(row)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(ROOT / "ml" / "data" / "training.csv"))
    a = ap.parse_args()
    rows = generate(a.rows, a.seed)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS + ["program"])
        w.writeheader()
        w.writerows(rows)
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["program"]] = counts.get(r["program"], 0) + 1
    print(f"Wrote {len(rows)} rows to {out}")
    for k in sorted(counts):
        print(f"  {k:26s} {counts[k]}")


if __name__ == "__main__":
    main()
