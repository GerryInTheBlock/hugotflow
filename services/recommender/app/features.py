"""Feature matrix for the C4.5-style tree (Build Plan §6 "Inputs").

One row per recommendation request. The same function builds rows for training (ml/generate_dataset.py)
and for live requests (app/main.py), so the model always sees the same columns.

Columns (raw, before one-hot encoding of the categorical ones):
  age, bmi                                   numbers
  goal                                       strength | weight_loss | general_wellness
  experience                                 beginner | intermediate | advanced
  limit_knee … limit_wrist_elbow             0/1 for each of the six joint/bone limitations in the Scope
  severity                                   0 none, 1 mild, 2 moderate, 3 severe
  daily_status                               0 good, 1 soreness, 2 pain   (Fig 13a one-tap check)
  racks_available … free_weights_available   0/1: at least one machine in that group is not Out of Order
"""

from __future__ import annotations

JOINTS = ["knee", "lower_back", "shoulder", "hip", "ankle", "wrist_elbow"]
LOWER_JOINTS = {"knee", "lower_back", "hip", "ankle"}
UPPER_JOINTS = {"shoulder", "wrist_elbow"}
SEVERITY = {"none": 0, "mild": 1, "moderate": 2, "severe": 3}
DAILY = {"good": 0, "soreness": 1, "pain": 2}

# Equipment categories in Appendix 2 → the five availability groups the tree sees.
EQUIPMENT_GROUPS = {
    "racks": ["Racks & Benches"],
    "cardio": ["Cardio"],
    "cables": ["Cable / Pull Machines"],
    "machines": ["Chest", "Back", "Shoulders", "Legs & Glutes"],
    "free_weights": ["Free Weights"],
}

NUMERIC = ["age", "bmi", "severity", "daily_status"] + [f"limit_{j}" for j in JOINTS] + [f"{g}_available" for g in EQUIPMENT_GROUPS]
CATEGORICAL = ["goal", "experience"]
COLUMNS = ["age", "bmi", "goal", "experience"] + [f"limit_{j}" for j in JOINTS] + ["severity", "daily_status"] + [f"{g}_available" for g in EQUIPMENT_GROUPS]


def availability(equipment: list[dict]) -> dict[str, int]:
    """equipment: rows with 'category' and 'maintenance_status'. A group is available if any of its items is usable."""
    out = {}
    for group, cats in EQUIPMENT_GROUPS.items():
        items = [e for e in equipment if e.get("category") in cats]
        out[f"{group}_available"] = int(any(e.get("maintenance_status") != "out_of_order" for e in items)) if items else 0
    return out


def build_row(*, age: int, bmi: float, goal: str, experience: str, conditions: list[str], severity: str,
              daily_status: str, available: dict[str, int]) -> dict:
    row = {
        "age": int(age),
        "bmi": float(bmi),
        "goal": goal,
        "experience": experience,
        "severity": SEVERITY.get(severity or "none", 0),
        "daily_status": DAILY.get(daily_status or "good", 0),
    }
    for j in JOINTS:
        row[f"limit_{j}"] = int(j in (conditions or []))
    for g in EQUIPMENT_GROUPS:
        row[f"{g}_available"] = int(available.get(f"{g}_available", 1))
    return {c: row[c] for c in COLUMNS}
