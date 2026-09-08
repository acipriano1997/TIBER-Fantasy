from __future__ import annotations

import json
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, confusion_matrix, log_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

DATA_URL = (
    "https://raw.githubusercontent.com/Prometheus-Frameworks/Signal-Validation-Model/"
    "main/outputs/validation_reports/wr_validation_dataset_role_enriched.csv"
)
OUT_DIR = Path("outputs/research/breakout_v1_2_policy")
FEATURES = [
    "feature_ppg",
    "feature_targets_per_game",
    "feature_games_played",
    "log_feature_finish",
    "expected_ppg_baseline",
]
BASELINE_THRESHOLD = 0.25
THRESHOLDS = np.round(np.arange(0.20, 0.601, 0.01), 2)


def tier_from_finish(value: float) -> int:
    if value <= 12: return 1
    if value <= 24: return 2
    if value <= 36: return 3
    if value <= 48: return 4
    return 5


def build_population(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy()
    numeric = [
        "feature_season", "outcome_season", "feature_games_played", "outcome_games_played",
        "feature_ppg", "feature_targets_per_game", "feature_finish", "outcome_finish",
        "expected_ppg_baseline",
    ]
    for col in numeric:
        work[col] = pd.to_numeric(work[col], errors="coerce")
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


def make_model():
    prep = ColumnTransformer([
        ("numeric", Pipeline([
            ("impute", SimpleImputer(strategy="median", add_indicator=True)),
            ("scale", StandardScaler()),
        ]), FEATURES)
    ])
    return Pipeline([
        ("prep", prep),
        ("model", LogisticRegression(C=10.0, max_iter=5000, solver="lbfgs", random_state=20260908)),
    ])


def clipped(p):
    return np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)


def logit(p):
    p = clipped(p)
    return np.log(p / (1 - p))


def fit_calibrator(oof: pd.DataFrame):
    if len(oof) < 20 or oof["y"].nunique() < 2:
        return None
    cal = LogisticRegression(C=1e6, solver="lbfgs", max_iter=5000, random_state=20260908)
    cal.fit(logit(oof["raw_prob"].to_numpy()).reshape(-1, 1), oof["y"].to_numpy(dtype=int))
    return cal


def apply_calibrator(cal, p):
    if cal is None:
        return clipped(p)
    return clipped(cal.predict_proba(logit(p).reshape(-1, 1))[:, 1])


def counts(y, pred):
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return int(tp), int(fp), int(fn), int(tn)


def class_metrics(y, p, threshold):
    pred = (p >= threshold).astype(int)
    tp, fp, fn, tn = counts(y, pred)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    base_rate = float(np.mean(y)) if len(y) else 0.0
    return {
        "threshold": float(threshold),
        "n": int(len(y)),
        "positive_events": int(np.sum(y)),
        "tagged": int(np.sum(pred)),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": precision,
        "recall": recall,
        "base_rate": base_rate,
        "lift": precision / base_rate if base_rate else 0.0,
        "tag_rate": float(np.mean(pred)) if len(pred) else 0.0,
    }


def choose_high_confidence_threshold(history: pd.DataFrame):
    if history.empty:
        return None, None
    y = history["y"].to_numpy(dtype=int)
    p = history["calibrated_prob"].to_numpy(dtype=float)
    min_tagged = max(10, int(np.ceil(0.08 * len(history))))
    candidates = []
    for t in THRESHOLDS:
        m = class_metrics(y, p, t)
        if m["tagged"] < min_tagged:
            continue
        if m["recall"] < 0.25:
            continue
        if m["lift"] < 1.5:
            continue
        # High-confidence tag: maximize precision, then recall, then threshold.
        candidates.append((m["precision"], m["recall"], m["lift"], t, m))
    if not candidates:
        return None, {"min_tagged": min_tagged, "reason": "no_threshold_met_constraints"}
    candidates.sort(reverse=True, key=lambda x: (x[0], x[1], x[2], x[3]))
    _, _, _, threshold, metrics = candidates[0]
    return float(threshold), {"min_tagged": min_tagged, "history_metrics": metrics}


def make_oof(data):
    seasons = sorted(int(x) for x in data["feature_season"].unique())
    all_oof = pd.DataFrame(columns=["player_id", "player_name", "feature_season", "y", "raw_prob", "calibrated_prob"])
    folds = []
    for val_season in seasons[1:]:
        train = data[data["feature_season"] < val_season]
        val = data[data["feature_season"] == val_season].copy()
        model = make_model()
        model.fit(train[FEATURES], train["ros_tier_jump"])
        raw = clipped(model.predict_proba(val[FEATURES])[:, 1])
        cal = fit_calibrator(all_oof)
        calibrated = apply_calibrator(cal, raw)
        fold = pd.DataFrame({
            "player_id": val["player_id"].to_numpy(),
            "player_name": val["player_name"].to_numpy(),
            "feature_season": val_season,
            "y": val["ros_tier_jump"].to_numpy(dtype=int),
            "raw_prob": raw,
            "calibrated_prob": calibrated,
        })
        learned_t, learned_meta = choose_high_confidence_threshold(all_oof)
        folds.append({
            "season": val_season,
            "history_rows": int(len(all_oof)),
            "learned_threshold": learned_t,
            "selection_meta": learned_meta,
            "baseline_0_25": class_metrics(fold["y"].to_numpy(dtype=int), calibrated, BASELINE_THRESHOLD),
            "prospective_high_confidence": None if learned_t is None else class_metrics(
                fold["y"].to_numpy(dtype=int), calibrated, learned_t
            ),
        })
        all_oof = pd.concat([all_oof, fold], ignore_index=True)
    return all_oof, folds


def aggregate_prospective(oof, folds):
    parts = []
    for f in folds:
        t = f["learned_threshold"]
        if t is None:
            continue
        part = oof[oof["feature_season"] == f["season"]].copy()
        part["threshold"] = t
        part["pred"] = (part["calibrated_prob"] >= t).astype(int)
        parts.append(part)
    if not parts:
        return None
    used = pd.concat(parts, ignore_index=True)
    y = used["y"].to_numpy(dtype=int)
    pred = used["pred"].to_numpy(dtype=int)
    tp, fp, fn, tn = counts(y, pred)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    base_rate = float(np.mean(y))
    return {
        "n": int(len(used)),
        "positive_events": int(y.sum()),
        "tagged": int(pred.sum()),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": precision,
        "recall": recall,
        "base_rate": base_rate,
        "lift": precision / base_rate if base_rate else 0.0,
        "tag_rate": float(np.mean(pred)),
        "seasons_evaluated": sorted(int(x) for x in used["feature_season"].unique()),
    }


def evaluate_fixed_thresholds(oof):
    y = oof["y"].to_numpy(dtype=int)
    p = oof["calibrated_prob"].to_numpy(dtype=float)
    rows = [class_metrics(y, p, t) for t in THRESHOLDS]
    # Pure development table; no future-certification claim.
    stable = [m for m in rows if m["tagged"] >= 20 and m["recall"] >= 0.20 and m["lift"] >= 1.5]
    stable.sort(key=lambda m: (m["precision"], m["recall"], m["lift"], m["threshold"]), reverse=True)
    return rows, stable[0] if stable else None


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with urlopen(DATA_URL, timeout=60) as response:
        raw = response.read()
    path = OUT_DIR / "wr_validation_dataset_role_enriched.csv"
    path.write_bytes(raw)
    data = build_population(pd.read_csv(path))
    oof, folds = make_oof(data)
    oof.to_csv(OUT_DIR / "baseline_oof_predictions.csv", index=False)

    y = oof["y"].to_numpy(dtype=int)
    p = oof["calibrated_prob"].to_numpy(dtype=float)
    baseline = class_metrics(y, p, BASELINE_THRESHOLD)
    baseline["brier_score"] = float(brier_score_loss(y, p))
    baseline["log_loss"] = float(log_loss(y, clipped(p), labels=[0, 1]))

    threshold_table, dev_fixed = evaluate_fixed_thresholds(oof)
    report = {
        "status": "development_only_not_certification",
        "model": "v1_baseline_logistic_unchanged",
        "probability_model_changed": False,
        "target": "ros_tier_jump",
        "baseline_threshold": BASELINE_THRESHOLD,
        "baseline_aggregate": baseline,
        "prospective_policy": {
            "rule": "For each season, choose threshold using only prior OOF predictions. Require >=8%/10 historical tags, >=25% recall, >=1.5x lift; maximize precision, then recall/lift/threshold. Abstain if no threshold qualifies.",
            "folds": folds,
            "aggregate": aggregate_prospective(oof, folds),
        },
        "development_only_fixed_high_confidence_candidate": dev_fixed,
        "all_fixed_thresholds": threshold_table,
        "probability_metrics_note": "Brier score and log loss are unchanged by classification threshold; thresholding only changes tag precision/recall/coverage.",
        "certification_note": "2023->2024 has already been inspected and is development evidence. No revised threshold may be promoted until tested on a genuinely unseen later outcome season.",
    }
    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("=== BREAKOUT_V1_2_POLICY_REPORT_JSON ===")
    print(json.dumps(report, indent=2))
    print("=== END_BREAKOUT_V1_2_POLICY_REPORT_JSON ===")


if __name__ == "__main__":
    main()
