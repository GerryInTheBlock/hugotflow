"""Labelling rules for the synthetic training set (Build Plan §6 step 2; ml/rules.md explains them in words).

The rules come from published exercise guidance and the instructors' usual programs (Chapter 3 interview).
They are checked top to bottom; the first one that matches gives the program class.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "recommender"))
from app.features import LOWER_JOINTS, UPPER_JOINTS  # noqa: E402

CLASSES = [
    "Strength-Standard",
    "Strength-Modified-Lower",
    "Strength-Modified-Upper",
    "WeightLoss-Standard",
    "WeightLoss-LowImpact",
    "Wellness-Standard",
    "Wellness-Mobility",
]

# Classes a coach might reasonably choose instead (used for the small "coach disagreement" noise).
NEIGHBOURS = {
    "Strength-Standard": ["Strength-Modified-Lower", "Wellness-Standard"],
    "Strength-Modified-Lower": ["Strength-Standard", "Strength-Modified-Upper", "Wellness-Mobility"],
    "Strength-Modified-Upper": ["Strength-Standard", "Strength-Modified-Lower"],
    "WeightLoss-Standard": ["WeightLoss-LowImpact"],
    "WeightLoss-LowImpact": ["WeightLoss-Standard", "Wellness-Mobility"],
    "Wellness-Standard": ["Wellness-Mobility", "WeightLoss-LowImpact"],
    "Wellness-Mobility": ["Wellness-Standard"],
}


def _limited(row: dict, joints: set[str]) -> bool:
    """A limitation counts as limiting when it is at least moderate."""
    return row["severity"] >= 2 and any(row[f"limit_{j}"] for j in joints)


def label(row: dict) -> str:
    lower = _limited(row, LOWER_JOINTS)
    upper = _limited(row, UPPER_JOINTS)

    # R1 Pain reported today: gentle mobility session whatever the goal.
    if row["daily_status"] == 2:
        return "Wellness-Mobility"

    if row["goal"] == "strength":
        if lower:  # R2
            return "Strength-Modified-Lower"
        if upper:  # R3
            return "Strength-Modified-Upper"
        if row["age"] >= 60:  # R4 older lifters: machine-led, joint-friendly strength
            return "Strength-Modified-Lower"
        if not row["racks_available"] and not row["free_weights_available"]:  # R5 no barbell/rack station usable
            return "Strength-Modified-Lower"
        return "Strength-Standard"  # R6

    if row["goal"] == "weight_loss":
        if lower or row["bmi"] >= 32 or row["age"] >= 55:  # R7 protect knees/hips/back from impact
            return "WeightLoss-LowImpact"
        if not row["cardio_available"]:  # R8 no cardio machine usable: low-impact machine circuit
            return "WeightLoss-LowImpact"
        return "WeightLoss-Standard"  # R9

    # general_wellness
    if lower or upper or row["age"] >= 60:  # R10
        return "Wellness-Mobility"
    if not row["machines_available"] and not row["cables_available"]:  # R11 mats and bodyweight only
        return "Wellness-Mobility"
    return "Wellness-Standard"  # R12
