from __future__ import annotations

import json
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, confusion_matrix, log_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import SplineTransformer, StandardScaler

DATA_URL = (
    "https://raw.githubusercontent.com/Prometheus-Frameworks/Signal-Validation-Model/"
    "main/outputs/validation_reports/wr_validation_dataset_role_enriched.csv"
)
OUT_DIR = Path("outputs/research/breakout_v1_1_dev")
FIXED_ACTION_THRESHOLD = 0.25
BASIC_FEATURES = [
    "feature_ppg",
    "feature_targets_per_game",
    "feature_games_played",
    "log_feature_finish",
    "expected_ppg_baseline",
]
ENRICHED_FEATURES = BASIC_FEATURES + [
    "feature_total_ppr",
    "career_year",
    "cohort_player_count",
    "expected_ppg_from_cohort",
    "expected_finish_from_cohort",
    "feature_ppg_minus_cohort_expected",
    "ppg_vs_expected_baseline",
    "targets_per_point",
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
    numeric = [
        "feature_season", "outcome_season", "feature_games_played", "outcome_games_played",
        "feature_ppg", "feature_targets_per_game", "feature_finish", "outcome_finish",
        "expected_ppg_baseline", "feature_total_ppr", "career_year", "cohort_player_count",
        "expected_ppg_from_cohort", "expected_finish_from_cohort", "feature_ppg_minus_cohort_expected",
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
    work["ppg_vs_expected_baseline"] = work["feature_ppg"] - work["expected_ppg_baseline"]
    work["targets_per_point"] = work["feature_targets_per_game"] / work["feature_ppg"].clip(lower=1.0)
    return work


def clipped(p):
    return np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)


def logit(p):
    p = clipped(p)
    return np.log(p / (1 - p))


def fit_online_platt(prior_oof: pd.DataFrame):
    if prior_oof.empty or prior_oof["y"].nunique() < 2 or len(prior_oof) < 20:
        return None
    cal = LogisticRegression(C=1e6, solver="lbfgs", max_iter=5000, random_state=20260908)
    cal.fit(logit(prior_oof["raw_prob"].to_numpy()).reshape(-1, 1), prior_oof["y"].to_numpy(dtype=int))
    return cal


def apply_platt(cal, p):
    if cal is None:
        return clipped(p)
    return clipped(cal.predict_proba(logit(p).reshape(-1, 1))[:, 1])


def make_baseline():
    prep = ColumnTransformer([
        ("numeric", Pipeline([
            ("impute", SimpleImputer(strategy="median", add_indicator=True)),
            ("scale", StandardScaler()),
        ]), BASIC_FEATURES)
    ])
    return Pipeline([
        ("prep", prep),
        ("model", LogisticRegression(C=10.0, max_iter=5000, solver="lbfgs", random_state=20260908)),
    ])


def make_enriched_logistic(C):
    prep = ColumnTransformer([
        ("numeric", Pipeline([
            ("impute", SimpleImputer(strategy="median", add_indicator=True)),
            ("scale", StandardScaler()),
        ]), ENRICHED_FEATURES)
    ])
    return Pipeline([
        ("prep", prep),
        ("model", LogisticRegression(C=C, max_iter=5000, solver="lbfgs", random_state=20260908)),
    ])


def make_spline_logistic(C):
    prep = ColumnTransformer([
        ("spline", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("spline", SplineTransformer(n_knots=4, degree=2, include_bias=False)),
            ("scale", StandardScaler()),
        ]), ENRICHED_FEATURES)
    ])
    return Pipeline([
        ("prep", prep),
        ("model", LogisticRegression(C=C, max_iter=5000, solver="lbfgs", random_state=20260908)),
    ])


def make_hist(max_leaf_nodes, l2):
    return Pipeline([
        ("impute", SimpleImputer(strategy="median", add_indicator=True)),
        ("model", HistGradientBoostingClassifier(
            learning_rate=0.035,
            max_iter=180,
            max_leaf_nodes=max_leaf_nodes,
            min_samples_leaf=20,
            l2_regularization=l2,
            random_state=20260908,
        )),
    ])


def candidate_specs():
    specs = [("v1_baseline_logistic", BASIC_FEATURES, make_baseline)]
    for C in [0.05, 0.1, 0.5, 1.0, 5.0]:
        specs.append((f"enriched_logistic_C{C}", ENRICHED_FEATURES, lambda C=C: make_enriched_logistic(C)))
    for C in [0.02, 0.05, 0.1, 0.5]:
        specs.append((f"spline_logistic_C{C}", ENRICHED_FEATURES, lambda C=C: make_spline_logistic(C)))
    for leaves in [7, 15]:
        for l2 in [1.0, 5.0, 10.0]:
            specs.append((f"hist_l{leaves}_l2_{l2}", ENRICHED_FEATURES, lambda leaves=leaves, l2=l2: make_hist(leaves, l2)))
    return specs


def confusion(y, pred):
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return int(tp), int(fp), int(fn), int(tn)


def metric_block(y, p):
    pred = (p >= FIXED_ACTION_THRESHOLD).astype(int)
    tp, fp, fn, tn = confusion(y, pred)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    base_rate = float(np.mean(y))
    return {
        "n": int(len(y)), "positive_events": int(np.sum(y)),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": precision, "recall": recall, "base_rate": base_rate,
        "lift": precision / base_rate if base_rate else 0.0,
        "brier_score": float(brier_score_loss(y, p)),
        "log_loss": float(log_loss(y, clipped(p), labels=[0, 1])),
        "pr_auc": float(average_precision_score(y, p)),
    }


def chronological_oof(data, name, features, factory):
    seasons = sorted(int(x) for x in data["feature_season"].unique())
    prior_oof = pd.DataFrame(columns=["feature_season", "y", "raw_prob", "calibrated_prob"])
    folds = []
    for val_season in seasons[1:]:
        train = data[data["feature_season"] < val_season]
        val = data[data["feature_season"] == val_season]
        if train.empty or val.empty or train["ros_tier_jump"].nunique() < 2:
            continue
        model = factory()
        model.fit(train[features], train["ros_tier_jump"])
        raw = clipped(model.predict_proba(val[features])[:, 1])
        cal = fit_online_platt(prior_oof)
        calibrated = apply_platt(cal, raw)
        fold = pd.DataFrame({
            "feature_season": val_season,
            "y": val["ros_tier_jump"].to_numpy(dtype=int),
            "raw_prob": raw,
            "calibrated_prob": calibrated,
        })
        folds.append({
            "season": val_season,
            "metrics": metric_block(fold["y"].to_numpy(dtype=int), fold["calibrated_prob"].to_numpy()),
            "calibrator_history_rows": int(len(prior_oof)),
        })
        prior_oof = pd.concat([prior_oof, fold], ignore_index=True)
    if prior_oof.empty:
        raise RuntimeError(f"No OOF predictions for {name}")
    agg = metric_block(prior_oof["y"].to_numpy(dtype=int), prior_oof["calibrated_prob"].to_numpy())
    return prior_oof, folds, agg


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with urlopen(DATA_URL, timeout=60) as response:
        raw = response.read()
    data_path = OUT_DIR / "wr_validation_dataset_role_enriched.csv"
    data_path.write_bytes(raw)
    source = pd.read_csv(data_path)
    data = build_population(source)

    results = []
    predictions = {}
    for name, features, factory in candidate_specs():
        oof, folds, aggregate = chronological_oof(data, name, features, factory)
        results.append({"name": name, "features": features, "folds": folds, "aggregate": aggregate})
        predictions[name] = oof

    # Model selection is development-only. Probability quality is primary; PR-AUC breaks ties.
    ranked = sorted(results, key=lambda r: (
        r["aggregate"]["log_loss"],
        r["aggregate"]["brier_score"],
        -r["aggregate"]["pr_auc"],
        r["name"],
    ))
    winner = ranked[0]
    baseline = next(r for r in results if r["name"] == "v1_baseline_logistic")

    winner_pred = predictions[winner["name"]].copy()
    winner_pred.to_csv(OUT_DIR / "winner_oof_predictions.csv", index=False)

    report = {
        "status": "development_only_not_certification",
        "reason": "2023->2024 was already inspected in v1 and therefore cannot remain an untouched certification holdout; 2024->2025 outcomes are unavailable in the producer artifact.",
        "target": "ros_tier_jump",
        "fixed_action_threshold": FIXED_ACTION_THRESHOLD,
        "available_complete_feature_seasons": sorted(int(x) for x in data["feature_season"].unique()),
        "chronological_protocol": "Expanding-window OOF by feature season. Each season is predicted only from earlier seasons. Online Platt calibration for a fold uses only OOF predictions from still-earlier folds.",
        "selection_rule": "lowest aggregate chronological OOF log loss, then Brier, then higher PR-AUC",
        "baseline": baseline,
        "winner": winner,
        "delta_vs_v1_baseline": {
            "log_loss": winner["aggregate"]["log_loss"] - baseline["aggregate"]["log_loss"],
            "brier_score": winner["aggregate"]["brier_score"] - baseline["aggregate"]["brier_score"],
            "pr_auc": winner["aggregate"]["pr_auc"] - baseline["aggregate"]["pr_auc"],
            "precision": winner["aggregate"]["precision"] - baseline["aggregate"]["precision"],
            "recall": winner["aggregate"]["recall"] - baseline["aggregate"]["recall"],
            "lift": winner["aggregate"]["lift"] - baseline["aggregate"]["lift"],
        },
        "all_candidates": ranked,
        "feature_governance": {
            "outcome_or_future_fields_used_as_features": False,
            "route_snap_air_yard_fields_used": False,
            "market_adp_used": False,
            "cohort_features": "historical-only producer enrichment",
        },
    }
    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("=== BREAKOUT_V1_1_DEV_REPORT_JSON ===")
    print(json.dumps(report, indent=2))
    print("=== END_BREAKOUT_V1_1_DEV_REPORT_JSON ===")


if __name__ == "__main__":
    main()
