from __future__ import annotations

import json
import math
import os
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    brier_score_loss,
    confusion_matrix,
    log_loss,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

DATA_URL = (
    "https://raw.githubusercontent.com/Prometheus-Frameworks/Signal-Validation-Model/"
    "main/outputs/validation_reports/wr_validation_dataset_role_enriched.csv"
)
OUT_DIR = Path("outputs/research/breakout_v1_oos")
FINAL_HOLDOUT_FEATURE_SEASON = 2024
FEATURES = [
    "feature_ppg",
    "feature_targets_per_game",
    "feature_games_played",
    "log_feature_finish",
    "expected_ppg_baseline",
]


def tier_from_finish(value: float) -> int:
    if value <= 12:
        return 1
    if value <= 24:
        return 2
    if value <= 36:
        return 3
    if value <= 48:
        return 4
    return 5


def build_population(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy()
    for col in [
        "feature_season",
        "outcome_season",
        "feature_games_played",
        "outcome_games_played",
        "feature_ppg",
        "feature_targets_per_game",
        "feature_finish",
        "outcome_finish",
        "expected_ppg_baseline",
    ]:
        work[col] = pd.to_numeric(work[col], errors="coerce")

    # Coverage eligibility only. Outcome games are used to require a sufficiently observed
    # label, never as a feature.
    work = work[
        work["has_valid_outcome"].astype(str).str.lower().eq("true")
        & work["feature_games_played"].ge(4)
        & work["outcome_games_played"].ge(8)
        & work["feature_finish"].notna()
        & work["outcome_finish"].notna()
        & work["feature_finish"].gt(12)
    ].copy()

    work["feature_tier"] = work["feature_finish"].map(tier_from_finish)
    work["outcome_tier"] = work["outcome_finish"].map(tier_from_finish)
    work["ros_tier_jump"] = (work["outcome_tier"] < work["feature_tier"]).astype(int)
    work["log_feature_finish"] = np.log1p(work["feature_finish"])
    return work


def make_model(C: float, class_weight: str | None) -> Pipeline:
    prep = ColumnTransformer(
        [("numeric", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), FEATURES)],
        remainder="drop",
    )
    return Pipeline([
        ("prep", prep),
        (
            "model",
            LogisticRegression(
                C=C,
                class_weight=class_weight,
                max_iter=5000,
                solver="lbfgs",
                random_state=20260908,
            ),
        ),
    ])


def clipped_probs(p: np.ndarray) -> np.ndarray:
    return np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)


def logit(p: np.ndarray) -> np.ndarray:
    p = clipped_probs(p)
    return np.log(p / (1 - p))


def fit_platt(raw_probs: np.ndarray, y: np.ndarray) -> LogisticRegression:
    cal = LogisticRegression(C=1e6, solver="lbfgs", max_iter=5000, random_state=20260908)
    cal.fit(logit(raw_probs).reshape(-1, 1), y)
    return cal


def apply_platt(cal: LogisticRegression, raw_probs: np.ndarray) -> np.ndarray:
    return clipped_probs(cal.predict_proba(logit(raw_probs).reshape(-1, 1))[:, 1])


def chronological_oof(data: pd.DataFrame, C: float, class_weight: str | None):
    pieces = []
    seasons = sorted(int(x) for x in data["feature_season"].dropna().unique())
    for val_season in seasons[1:]:
        train = data[data["feature_season"] < val_season]
        val = data[data["feature_season"] == val_season]
        if train.empty or val.empty or train["ros_tier_jump"].nunique() < 2:
            continue
        model = make_model(C, class_weight)
        model.fit(train[FEATURES], train["ros_tier_jump"])
        probs = clipped_probs(model.predict_proba(val[FEATURES])[:, 1])
        pieces.append(pd.DataFrame({
            "feature_season": val_season,
            "y": val["ros_tier_jump"].to_numpy(dtype=int),
            "raw_prob": probs,
        }))
    if not pieces:
        raise RuntimeError("No chronological OOF folds were available")
    return pd.concat(pieces, ignore_index=True)


def choose_model(pre_holdout: pd.DataFrame):
    candidates = []
    for C in [0.05, 0.1, 0.5, 1.0, 5.0, 10.0]:
        for class_weight in [None, "balanced"]:
            oof = chronological_oof(pre_holdout, C, class_weight)
            y = oof["y"].to_numpy(dtype=int)
            p = clipped_probs(oof["raw_prob"].to_numpy())
            candidates.append({
                "C": C,
                "class_weight": class_weight,
                "log_loss": float(log_loss(y, p, labels=[0, 1])),
                "brier": float(brier_score_loss(y, p)),
                "oof": oof,
            })
    candidates.sort(key=lambda x: (x["log_loss"], x["brier"], x["C"], str(x["class_weight"])))
    return candidates[0], candidates


def choose_threshold(calibrated_oof: np.ndarray, y: np.ndarray) -> float:
    # Frozen before final holdout. Prefer an actionable detector with at least 20% recall,
    # then maximize F1; ties prefer the higher threshold.
    best = None
    for threshold in np.arange(0.10, 0.901, 0.01):
        pred = (calibrated_oof >= threshold).astype(int)
        tp, fp, fn, tn = confusion_counts(y, pred)
        if tp + fp < 10:
            continue
        recall = tp / (tp + fn) if tp + fn else 0.0
        precision = tp / (tp + fp) if tp + fp else 0.0
        if recall < 0.20:
            continue
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        key = (f1, precision, threshold)
        if best is None or key > best[0]:
            best = (key, float(threshold))
    if best is None:
        return 0.50
    return best[1]


def confusion_counts(y_true: np.ndarray, y_pred: np.ndarray):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return int(tp), int(fp), int(fn), int(tn)


def metric_block(y: np.ndarray, p: np.ndarray, threshold: float):
    pred = (p >= threshold).astype(int)
    tp, fp, fn, tn = confusion_counts(y, pred)
    precision = float(precision_score(y, pred, zero_division=0))
    recall = float(recall_score(y, pred, zero_division=0))
    base_rate = float(np.mean(y))
    lift = float(precision / base_rate) if base_rate > 0 else 0.0
    return {
        "threshold": threshold,
        "n": int(len(y)),
        "positive_events": int(y.sum()),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": precision,
        "recall": recall,
        "base_rate": base_rate,
        "lift": lift,
        "brier_score": float(brier_score_loss(y, p)),
        "log_loss": float(log_loss(y, clipped_probs(p), labels=[0, 1])),
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with urlopen(DATA_URL, timeout=60) as response:
        raw = response.read()
    data_path = OUT_DIR / "wr_validation_dataset_role_enriched.csv"
    data_path.write_bytes(raw)

    source = pd.read_csv(data_path)
    data = build_population(source)
    seasons = sorted(int(x) for x in data["feature_season"].unique())
    if FINAL_HOLDOUT_FEATURE_SEASON not in seasons:
        raise RuntimeError(f"Final holdout season {FINAL_HOLDOUT_FEATURE_SEASON} unavailable: {seasons}")

    pre = data[data["feature_season"] < FINAL_HOLDOUT_FEATURE_SEASON].copy()
    holdout = data[data["feature_season"] == FINAL_HOLDOUT_FEATURE_SEASON].copy()

    best, candidates = choose_model(pre)
    best_oof = best["oof"].copy()
    platt = fit_platt(best_oof["raw_prob"].to_numpy(), best_oof["y"].to_numpy(dtype=int))
    oof_cal = apply_platt(platt, best_oof["raw_prob"].to_numpy())
    threshold = choose_threshold(oof_cal, best_oof["y"].to_numpy(dtype=int))

    final_model = make_model(best["C"], best["class_weight"])
    final_model.fit(pre[FEATURES], pre["ros_tier_jump"])
    raw_holdout = clipped_probs(final_model.predict_proba(holdout[FEATURES])[:, 1])
    calibrated_holdout = apply_platt(platt, raw_holdout)
    y_holdout = holdout["ros_tier_jump"].to_numpy(dtype=int)

    metrics = metric_block(y_holdout, calibrated_holdout, threshold)
    holdout_base_rate = float(np.mean(y_holdout))
    constant = np.full(len(y_holdout), holdout_base_rate, dtype=float)
    baseline = {
        "brier_score": float(brier_score_loss(y_holdout, constant)),
        "log_loss": float(log_loss(y_holdout, clipped_probs(constant), labels=[0, 1])),
    }

    # Simple challenger: prior-season PPG + targets/game only, fixed regularized logistic.
    challenger_features = ["feature_ppg", "feature_targets_per_game"]
    challenger = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("model", LogisticRegression(C=1.0, max_iter=5000, solver="lbfgs", random_state=20260908)),
    ])
    challenger.fit(pre[challenger_features], pre["ros_tier_jump"])
    challenger_raw = clipped_probs(challenger.predict_proba(holdout[challenger_features])[:, 1])
    challenger_metrics = {
        "brier_score": float(brier_score_loss(y_holdout, challenger_raw)),
        "log_loss": float(log_loss(y_holdout, challenger_raw, labels=[0, 1])),
    }

    holdout_ledger = holdout[[
        "player_id", "player_name", "feature_season", "outcome_season",
        "feature_finish", "outcome_finish", "feature_tier", "outcome_tier", "ros_tier_jump"
    ]].copy()
    holdout_ledger["raw_probability"] = raw_holdout
    holdout_ledger["calibrated_probability"] = calibrated_holdout
    holdout_ledger["predicted_breakout"] = (calibrated_holdout >= threshold).astype(int)
    holdout_ledger.to_csv(OUT_DIR / "holdout_predictions.csv", index=False)

    report = {
        "status": "research_only_unpromoted",
        "run_name": "breakout_v1_chronological_oos",
        "source": {
            "repository": "Prometheus-Frameworks/Signal-Validation-Model",
            "artifact": "outputs/validation_reports/wr_validation_dataset_role_enriched.csv",
            "url": DATA_URL,
            "source_rows": int(len(source)),
        },
        "target": {
            "id": "ros_tier_jump",
            "definition": "Outcome positional finish improves by at least one frozen tier: top12, top24, top36, top48, or >48; players already top12 in feature season are excluded.",
            "feature_min_games": 4,
            "outcome_min_games_for_label": 8,
        },
        "features": FEATURES,
        "feature_note": "No ADP, route, snap, target-share, age, or current depth-chart fields are used because governed historical coverage is unavailable/insufficient in the source artifact.",
        "chronology": {
            "available_feature_seasons": seasons,
            "training_and_selection_seasons": sorted(int(x) for x in pre["feature_season"].unique()),
            "final_holdout_feature_season": FINAL_HOLDOUT_FEATURE_SEASON,
            "final_holdout_outcome_season": int(holdout["outcome_season"].mode().iloc[0]),
            "holdout_touched_during_selection": False,
        },
        "model_selection": {
            "criterion": "lowest chronological OOF log loss, then Brier score",
            "chosen_C": best["C"],
            "chosen_class_weight": best["class_weight"],
            "oof_log_loss_raw": best["log_loss"],
            "oof_brier_raw": best["brier"],
            "calibration": "Platt scaling fit only on pre-holdout chronological OOF predictions",
            "action_threshold": threshold,
            "threshold_rule": "chosen on calibrated pre-holdout OOF predictions to maximize F1 subject to >=20% recall and >=10 predicted positives",
        },
        "final_holdout_metrics": metrics,
        "constant_base_rate_probability_baseline": baseline,
        "simple_challenger_probability_metrics": challenger_metrics,
        "certification_checks": {
            "positive_events_at_least_30": metrics["positive_events"] >= 30,
            "precision_at_least_15pct": metrics["precision"] >= 0.15,
            "lift_gt_1_5": metrics["lift"] > 1.5,
            "brier_beats_base_rate": metrics["brier_score"] < baseline["brier_score"],
            "log_loss_beats_base_rate": metrics["log_loss"] < baseline["log_loss"],
            "brier_beats_simple_challenger": metrics["brier_score"] < challenger_metrics["brier_score"],
            "log_loss_beats_simple_challenger": metrics["log_loss"] < challenger_metrics["log_loss"],
        },
    }

    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("=== BREAKOUT_V1_OOS_REPORT_JSON ===")
    print(json.dumps(report, indent=2))
    print("=== END_BREAKOUT_V1_OOS_REPORT_JSON ===")


if __name__ == "__main__":
    main()
