"""Evaluation report for Chapter 4 (Build Plan §6 step 5).

Writes ml/report.md with:
  - accuracy, macro precision / recall / F1 on the 20% test split, and the per-class report
  - the confusion matrix
  - Gain Ratio per attribute on the training split, computed the C4.5 way (Formulas 1–4 in Chapter 3):
        Entropy(S)        = −Σ p_i · log2 p_i
        Gain(S, A)        = Entropy(S) − Σ |S_v|/|S| · Entropy(S_v)
        SplitInfo(S, A)   = −Σ |S_v|/|S| · log2(|S_v|/|S|)
        GainRatio(S, A)   = Gain(S, A) / SplitInfo(S, A)
    Continuous attributes (age, BMI) use the binary threshold with the highest gain ratio, as C4.5 does.
  - the IF-THEN rules of the trained tree

Run after train.py:  python ml/evaluate.py
"""

from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path

import joblib
from sklearn.metrics import classification_report, confusion_matrix

from train import DATA, MODEL_DIR, load, metrics, split

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "ml" / "report.md"


def entropy(labels) -> float:
    n = len(labels)
    return -sum((c / n) * math.log2(c / n) for c in Counter(labels).values()) if n else 0.0


def gain_ratio_discrete(values, labels) -> tuple[float, float, float]:
    n = len(labels)
    base = entropy(labels)
    groups: dict = {}
    for v, l in zip(values, labels):
        groups.setdefault(v, []).append(l)
    remainder = sum(len(g) / n * entropy(g) for g in groups.values())
    gain = base - remainder
    split_info = -sum(len(g) / n * math.log2(len(g) / n) for g in groups.values())
    return gain, split_info, (gain / split_info if split_info > 0 else 0.0)


def gain_ratio_continuous(values, labels) -> tuple[float, float, float, float]:
    best = (0.0, 0.0, 0.0, None)
    for t in sorted(set(values))[:-1]:
        g, s, r = gain_ratio_discrete([v <= t for v in values], labels)
        if r > best[2]:
            best = (g, s, r, t)
    return best


def main() -> None:
    X, y = load(DATA)
    X_train, X_test, y_train, y_test = split(X, y)
    model = joblib.load(MODEL_DIR / "model.joblib")
    card = json.loads((MODEL_DIR / "model_card.json").read_text(encoding="utf-8"))
    pred = model.predict(X_test)
    m = metrics(model, X_test, y_test)
    classes = list(model.named_steps["tree"].classes_)
    cm = confusion_matrix(y_test, pred, labels=classes)

    labels = list(y_train)
    rows = []
    for col in X_train.columns:
        vals = list(X_train[col])
        if col in ("age", "bmi"):
            g, s, r, t = gain_ratio_continuous(vals, labels)
            rows.append((col + f" (<= {t})", g, s, r))
        else:
            g, s, r = gain_ratio_discrete(vals, labels)
            rows.append((col, g, s, r))
    rows.sort(key=lambda x: -x[3])

    short = {c: f"C{i + 1}" for i, c in enumerate(classes)}
    lines = [
        f"# Recommendation model report — {card['version']}",
        "",
        f"Trained {card['trained_at']} on {card['rows']['train']} examples, tested on {card['rows']['test']} "
        "(stratified 80/20 split of the synthetic, rule-labelled dataset; see ml/rules.md).",
        f"Algorithm: {card['algorithm']}. Best parameters (5-fold GridSearchCV, macro F1): `{card['best_params']}`. "
        f"Tree depth {card['depth']}, {card['leaves']} leaves.",
        "",
        "## Test-set metrics",
        "",
        "| Accuracy | Precision (macro) | Recall (macro) | F1 (macro) |",
        "| --- | --- | --- | --- |",
        f"| {m['accuracy']:.4f} | {m['precision_macro']:.4f} | {m['recall_macro']:.4f} | {m['f1_macro']:.4f} |",
        "",
        "```",
        classification_report(y_test, pred, labels=classes, zero_division=0),
        "```",
        "",
        "## Confusion matrix (rows = actual, columns = predicted)",
        "",
        "Classes: " + ", ".join(f"{v} = {k}" for k, v in short.items()),
        "",
        "| | " + " | ".join(short[c] for c in classes) + " |",
        "| --- |" + " --- |" * len(classes),
    ]
    for c, row in zip(classes, cm):
        lines.append(f"| **{short[c]}** | " + " | ".join(str(v) for v in row) + " |")
    lines += [
        "",
        "## Gain Ratio per attribute (training split, Formulas 1–4)",
        "",
        f"Entropy of the training set: {entropy(labels):.4f} bits.",
        "",
        "| Attribute | Information gain | Split info | Gain ratio |",
        "| --- | --- | --- | --- |",
    ]
    lines += [f"| {a} | {g:.4f} | {s:.4f} | {r:.4f} |" for a, g, s, r in rows]
    lines += ["", "## IF-THEN rules of the trained tree", "", "```", card["rules"], "```", ""]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT}")
    print("Top attributes by gain ratio:", ", ".join(f"{a} {r:.3f}" for a, _, _, r in rows[:5]))


if __name__ == "__main__":
    main()
