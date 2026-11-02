"""Train the C4.5-style decision tree (Build Plan §6 steps 3–4, 6; Chapter 3 training pipeline).

  - preprocessing fitted on the training split only: median imputation (numbers), most-frequent imputation and
    one-hot encoding (goal, experience); no scaling (trees do not need it)
  - stratified 80/20 split
  - DecisionTreeClassifier(criterion="entropy") — scikit-learn's entropy tree approximates C4.5 (paper, Limitations)
  - GridSearchCV, 5-fold stratified, over max_depth, min_samples_split, min_samples_leaf, ccp_alpha (macro F1)
  - saves the whole pipeline (services/recommender/model/model.joblib) and a model card with metrics and the
    IF-THEN rules (export_text) for the instructors and the Engine Monitoring page (Fig 17)

Run:  python ml/generate_dataset.py && python ml/train.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.tree import DecisionTreeClassifier, export_text

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "recommender"))
from app.features import CATEGORICAL, COLUMNS, NUMERIC  # noqa: E402

DATA = ROOT / "ml" / "data" / "training.csv"
MODEL_DIR = ROOT / "services" / "recommender" / "model"
VERSION = "c45-v1"
SEED = 42


def load(path: Path = DATA):
    df = pd.read_csv(path)
    return df[COLUMNS], df["program"]


def make_pipeline() -> Pipeline:
    pre = ColumnTransformer(
        [
            ("num", SimpleImputer(strategy="median"), NUMERIC),
            ("cat", Pipeline([("impute", SimpleImputer(strategy="most_frequent")),
                              ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), CATEGORICAL),
        ],
        verbose_feature_names_out=False,
    )
    return Pipeline([("pre", pre), ("tree", DecisionTreeClassifier(criterion="entropy", random_state=SEED))])


def split(X, y):
    return train_test_split(X, y, test_size=0.2, stratify=y, random_state=SEED)


def train(X_train, y_train) -> GridSearchCV:
    grid = {
        "tree__max_depth": [4, 6, 8, 10, 12, None],
        "tree__min_samples_split": [2, 10, 20],
        "tree__min_samples_leaf": [1, 5, 10],
        "tree__ccp_alpha": [0.0, 0.001, 0.005],
    }
    search = GridSearchCV(make_pipeline(), grid, scoring="f1_macro",
                          cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED), n_jobs=-1)
    search.fit(X_train, y_train)
    return search


def metrics(model, X_test, y_test) -> dict:
    pred = model.predict(X_test)
    return {
        "accuracy": round(accuracy_score(y_test, pred), 4),
        "precision_macro": round(precision_score(y_test, pred, average="macro", zero_division=0), 4),
        "recall_macro": round(recall_score(y_test, pred, average="macro", zero_division=0), 4),
        "f1_macro": round(f1_score(y_test, pred, average="macro", zero_division=0), 4),
    }


def main() -> None:
    X, y = load()
    X_train, X_test, y_train, y_test = split(X, y)
    search = train(X_train, y_train)
    model = search.best_estimator_
    feature_names = list(model.named_steps["pre"].get_feature_names_out())
    tree = model.named_steps["tree"]
    card = {
        "version": VERSION,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sklearn_version": sklearn.__version__,  # the service must load the model with the same version
        "algorithm": 'DecisionTreeClassifier(criterion="entropy") — C4.5-style',
        "best_params": {k.replace("tree__", ""): v for k, v in search.best_params_.items()},
        "cv_f1_macro": round(search.best_score_, 4),
        "test_metrics": metrics(model, X_test, y_test),
        "rows": {"train": len(X_train), "test": len(X_test)},
        "classes": list(tree.classes_),
        "features": feature_names,
        "depth": int(tree.get_depth()),
        "leaves": int(tree.get_n_leaves()),
        "rules": export_text(tree, feature_names=feature_names, decimals=1),
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_DIR / "model.joblib")
    (MODEL_DIR / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")
    print(f"Saved {VERSION}: depth {card['depth']}, {card['leaves']} leaves")
    print("Best parameters:", card["best_params"])
    print("Cross-validated macro F1:", card["cv_f1_macro"])
    print("Test set:", card["test_metrics"])


if __name__ == "__main__":
    main()
