"""Recommendation logic (Fig 18), kept apart from the web layer so it can be tested on its own.

Order of work, following the paper and Build Plan §3 #4:
  1. consent check — members under 18 with a limitation need a verified guardian consent first (Scope)
  2. severity gate — a severe limitation or pain today raises a High-Risk Alert (the routine is still modified)
  3. feature row → C4.5-style tree → program class, with the decision path (Fig 17)
  4. class → exercises: leave out what strains the member's limitation or needs Out of Order equipment,
     use the substitutes from the Appendix 2 replacement guide
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pandas as pd

from .features import JOINTS, availability, build_row

PROGRAMS = json.loads((Path(__file__).parent / "programs.json").read_text(encoding="utf-8"))["classes"]
JOINT_LABEL = {"knee": "Knee", "lower_back": "Lower back", "shoulder": "Shoulder", "hip": "Hip", "ankle": "Ankle", "wrist_elbow": "Wrist/elbow"}
SEVERITY_LABEL = {"mild": "Mild", "moderate": "Moderate", "severe": "Severe"}


class Locked(Exception):
    """The member cannot get a recommendation yet (no profile, or consent not verified)."""


@dataclass
class Result:
    program: str
    routine: list[dict]
    skipped: list[dict]
    decision_path: list[dict]
    features: dict
    alert: bool
    alert_summary: str | None
    minutes: int
    usable_equipment: int
    excluded_equipment: list[str] = field(default_factory=list)


def age_on(birthdate: str | None, today: date) -> int | None:
    if not birthdate:
        return None
    y, m, d = (int(x) for x in birthdate[:10].split("-"))
    return today.year - y - ((today.month, today.day) < (m, d))


def severity_gate(profile: dict, daily: dict | None) -> str | None:
    """Fig 18: decide whether this request needs a High-Risk Alert, and say why."""
    conds = profile.get("joint_conditions") or []
    if profile.get("severity") == "severe" and conds:
        return f"Severe {', '.join(JOINT_LABEL[c].lower() for c in conds)} condition"
    if daily and daily.get("status") == "pain":
        area = daily.get("body_area") or "body"
        return f"Pain reported today: {area}"
    return None


def decision_path(model, frame: pd.DataFrame) -> tuple[list[dict], dict]:
    pre = model.named_steps["pre"]
    tree = model.named_steps["tree"]
    names = list(pre.get_feature_names_out())
    x = pre.transform(frame)
    nodes = tree.decision_path(x).indices
    t = tree.tree_
    steps = []
    for n in nodes:
        if t.children_left[n] == t.children_right[n]:  # leaf
            continue
        f = names[t.feature[n]]
        value = float(x[0, t.feature[n]])
        thr = float(t.threshold[n])
        steps.append({"node": int(n), "feature": f, "value": round(value, 2), "op": "<=" if value <= thr else ">", "threshold": round(thr, 2)})
    matrix = {names[i]: round(float(x[0, i]), 2) for i in range(len(names))}
    return steps, matrix


def dosage(experience: str, modified: bool, daily: str) -> tuple[int, str, str]:
    if modified or experience == "beginner":
        sets, reps = 3, "10"
    elif experience == "intermediate":
        sets, reps = 3, "12"
    else:
        sets, reps = 4, "12"
    if daily == "soreness":
        sets = max(2, sets - 1)
    return sets, reps, ("light" if modified else "moderate")


def build_routine(program: str, *, exercises: dict[str, dict], equipment: dict[int, dict], conditions: list[str],
                  severity: str, experience: str, daily: str, goal: str, seed: str = "") -> tuple[list[dict], list[dict]]:
    spec = PROGRAMS[program]
    sets, reps, intensity = dosage(experience, spec["modified"], daily)
    routine: list[dict] = []
    skipped: list[dict] = []
    used: set[str] = set()

    def why_not(ex: dict) -> str | None:
        hit = [c for c in ex.get("contraindicated") or [] if c in conditions]
        if hit:
            return f"{JOINT_LABEL[hit[0]]} constraint"
        eq = equipment.get(ex.get("equipment_id"))
        if not eq or eq.get("maintenance_status") == "out_of_order":
            return f"{eq['name'] if eq else 'Equipment'} is Out of Order"
        if severity == "severe" and ex.get("impact") == "high":
            return "High impact"
        return None

    for slot in spec["slots"]:
        candidates = [c for c in slot if c in exercises]
        # then the replacement-guide substitutes of each candidate
        for c in list(candidates):
            candidates += [s for s in exercises[c].get("substitutes") or [] if s in exercises and s not in candidates]
        chosen = None
        for i, code in enumerate(candidates):
            if code in used:
                continue
            reason = why_not(exercises[code])
            if reason is None:
                chosen = exercises[code]
                break
            if i == 0:
                skipped.append({"code": code, "name": exercises[code]["name"], "reason": reason})
        if not chosen:
            continue
        # Spread members across the floor: when the slot's own list has two or more safe, free choices, the first
        # choice alternates per member and day (seed), so people with the same program don't all queue for one machine.
        if seed:
            safe = [c for c in slot if c in exercises and c not in used and why_not(exercises[c]) is None][:2]
            if len(safe) == 2:
                pick = int(hashlib.md5(f"{seed}:{len(routine)}".encode()).hexdigest(), 16) % 2
                chosen = exercises[safe[pick]]
        used.add(chosen["code"])
        eq = equipment[chosen["equipment_id"]]
        item = {
            "code": chosen["code"],
            "name": chosen["name"],
            "equipment": eq["name"],
            "equipment_id": eq["equipment_id"],
            "pattern": chosen.get("pattern"),
            "cue": chosen.get("cue"),
            "rest_s": 60,
            "intensity": intensity,
        }
        if chosen.get("pattern") in ("cardio", "mobility"):
            item.update(sets=1, minutes=(8 if chosen["pattern"] == "mobility" else (15 if experience == "beginner" else 20) if goal == "weight_loss" else 10))
        else:
            item.update(sets=sets, reps=reps)
        routine.append(item)
    return routine, skipped


def minutes_of(routine: list[dict]) -> int:
    total = sum(i.get("minutes") or i.get("sets", 1) * 1.7 for i in routine)
    return int(5 * round(total / 5)) or 5


def recommend(model, *, profile: dict, user: dict, daily: dict | None, equipment_rows: list[dict],
              exercise_rows: list[dict], today: date) -> Result:
    if not profile:
        raise Locked("Fill in your health profile first.")
    age = age_on(user.get("birthdate"), today)
    conds = [c for c in (profile.get("joint_conditions") or []) if c in JOINTS]
    if age is not None and age < 18 and conds and not profile.get("consent_verified"):
        raise Locked("Your workout plan is locked until your instructor verifies your guardian consent.")

    summary = severity_gate(profile, daily)
    available = availability(equipment_rows)
    row = build_row(
        age=age or 25,
        bmi=float(profile.get("bmi") or 24),
        goal=profile.get("fitness_goal") or "general_wellness",
        experience=profile.get("experience_level") or "beginner",
        conditions=conds,
        severity=profile.get("severity") or "none",
        daily_status=(daily or {}).get("status") or "good",
        available=available,
    )
    frame = pd.DataFrame([row])
    program = str(model.predict(frame)[0])
    path, matrix = decision_path(model, frame)

    equipment = {e["equipment_id"]: e for e in equipment_rows}
    exercises = {e["code"]: e for e in exercise_rows if e.get("code")}
    routine, skipped = build_routine(
        program, exercises=exercises, equipment=equipment, conditions=conds,
        severity=profile.get("severity") or "none", experience=row["experience"],
        daily=(daily or {}).get("status") or "good", goal=row["goal"],
        seed=f"{user.get('user_id', '')}:{today.isoformat()}",
    )
    usable = [e for e in equipment_rows if e.get("maintenance_status") != "out_of_order"]
    return Result(
        program=program,
        routine=routine,
        skipped=skipped,
        decision_path=path,
        features={**row, "_transformed": matrix},
        alert=summary is not None,
        alert_summary=summary,
        minutes=minutes_of(routine),
        usable_equipment=len(usable),
        excluded_equipment=[e["name"] for e in equipment_rows if e.get("maintenance_status") == "out_of_order"],
    )
