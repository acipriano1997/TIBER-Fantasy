from __future__ import annotations

import hashlib
import json
from urllib.request import urlopen

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

URL = "https://raw.githubusercontent.com/Prometheus-Frameworks/TIBER-Data/main/exports/promoted/nfl/player_season_coverage_v0.json"
EXPECTED_SHA256 = "d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac"
ACTION_THRESHOLD = 0.25
FEATURES = [
    "feature_ppg", "feature_targets_per_game", "feature_games_played",
    "log_feature_finish", "expected_ppg_baseline",
    "feature_target_share", "feature_air_yards_share", "feature_wopr",
    "feature_racr", "feature_receiving_yards_per_target", "feature_catch_rate",
    "feature_season_age", "feature_career_year", "feature_draft_pick",
]


def safe_num(v):
    try:
        if v is None:
            return np.nan
        return float(v)
    except (TypeError, ValueError):
        return np.nan


def load_records():
    with urlopen(URL, timeout=120) as response:
        raw = response.read()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA256:
        raise RuntimeError(f"artifact sha mismatch: {sha}")
    payload = json.loads(raw)
    records = [
        r for r in payload["records"]
        if r.get("position") == "WR" and r.get("season_type") == "REG"
    ]
    seasons = sorted({int(r["season"]) for r in records})
    if seasons != [2021, 2022, 2023, 2024, 2025]:
        raise RuntimeError(f"unexpected WR seasons: {seasons}")
    return records


def season_frame(records):
    rows = []
    for r in records:
        prod = r.get("production_summary") or {}
        usage = r.get("usage_summary") or {}
        games = safe_num(r.get("games_played"))
        if not np.isfinite(games):
            games = safe_num(prod.get("games_for_ppg"))
        ppg = safe_num(prod.get("season_ppg"))
        total = safe_num(prod.get("season_ppr"))
        targets = safe_num(usage.get("targets"))
        receptions = safe_num(usage.get("receptions"))
        receiving_yards = safe_num((prod.get("receiving") or {}).get("receiving_yards"))
        tpg = targets / games if np.isfinite(targets) and np.isfinite(games) and games > 0 else np.nan
        catch_rate = receptions / targets if np.isfinite(receptions) and np.isfinite(targets) and targets > 0 else np.nan
        ypt = receiving_yards / targets if np.isfinite(receiving_yards) and np.isfinite(targets) and targets > 0 else np.nan
        rows.append({
            "player_id": r["player_id"],
            "player_name": r["player_name"],
            "team": r.get("primary_team"),
            "season": int(r["season"]),
            "games_played": games,
            "season_ppg": ppg,
            "season_ppr": total,
            "targets_per_game": tpg,
            "target_share": safe_num(usage.get("target_share")),
            "air_yards_share": safe_num(usage.get("air_yards_share")),
            "wopr": safe_num(usage.get("wopr")),
            "racr": safe_num(usage.get("racr")),
            "receiving_yards_per_target": ypt,
            "catch_rate": catch_rate,
            "season_age": safe_num(r.get("season_age")),
            "career_year": safe_num(r.get("career_year")),
            "draft_pick": safe_num(r.get("draft_pick")),
        })
    df = pd.DataFrame(rows)
    df["finish"] = np.nan
    for _, idx in df.groupby("season").groups.items():
        ordered = df.loc[idx].sort_values(
            ["season_ppg", "season_ppr", "player_id"],
            ascending=[False, False, True],
            kind="mergesort",
        )
        df.loc[ordered.index, "finish"] = np.arange(1, len(ordered) + 1)
    return df


def tier(finish):
    if finish <= 12:
        return 1
    if finish <= 24:
        return 2
    if finish <= 36:
        return 3
    if finish <= 48:
        return 4
    return 5


def feature_row(r):
    target_share_for_expected = r.target_share if np.isfinite(r.target_share) else 0.0
    return {
        "player_id": r.player_id,
        "player_name": r.player_name,
        "team": r.team,
        "feature_season": int(r.season),
        "feature_ppg": r.season_ppg,
        "feature_targets_per_game": r.targets_per_game,
        "feature_games_played": r.games_played,
        "log_feature_finish": np.log1p(r.finish),
        "expected_ppg_baseline": round(
            float(r.season_ppg) * 0.7
            + float(r.targets_per_game) * 0.2
            + float(target_share_for_expected) * 10.0,
            4,
        ),
        "feature_target_share": r.target_share,
        "feature_air_yards_share": r.air_yards_share,
        "feature_wopr": r.wopr,
        "feature_racr": r.racr,
        "feature_receiving_yards_per_target": r.receiving_yards_per_target,
        "feature_catch_rate": r.catch_rate,
        "feature_season_age": r.season_age,
        "feature_career_year": r.career_year,
        "feature_draft_pick": r.draft_pick,
        "feature_finish": int(r.finish),
    }


def build_training(df):
    by = {(r.player_id, int(r.season)): r for r in df.itertuples(index=False)}
    rows = []
    for r in df.itertuples(index=False):
        fs = int(r.season)
        if fs > 2024:
            continue
        o = by.get((r.player_id, fs + 1))
        if o is None:
            continue
        if not (np.isfinite(r.games_played) and r.games_played >= 4):
            continue
        if not (np.isfinite(o.games_played) and o.games_played >= 8):
            continue
        if not (np.isfinite(r.finish) and np.isfinite(o.finish)) or r.finish <= 12:
            continue
        if not (np.isfinite(r.season_ppg) and np.isfinite(r.targets_per_game)):
            continue
        row = feature_row(r)
        row["outcome_season"] = fs + 1
        row["y"] = int(tier(o.finish) < tier(r.finish))
        rows.append(row)
    return pd.DataFrame(rows)


def build_2026_candidates(df):
    rows = []
    for r in df[df.season == 2025].itertuples(index=False):
        if not (np.isfinite(r.games_played) and r.games_played >= 4):
            continue
        if not np.isfinite(r.finish) or r.finish <= 12:
            continue
        if not (np.isfinite(r.season_ppg) and np.isfinite(r.targets_per_game)):
            continue
        rows.append(feature_row(r))
    return pd.DataFrame(rows)


def make_model():
    prep = ColumnTransformer([
        ("num", Pipeline([
            ("impute", SimpleImputer(strategy="median", add_indicator=True)),
            ("scale", StandardScaler()),
        ]), FEATURES),
    ], remainder="drop")
    return Pipeline([
        ("prep", prep),
        ("model", LogisticRegression(
            C=5.0,
            class_weight=None,
            max_iter=5000,
            solver="lbfgs",
            random_state=20260908,
        )),
    ])


def main():
    records = load_records()
    df = season_frame(records)
    train = build_training(df)
    candidates = build_2026_candidates(df)
    model = make_model()
    model.fit(train[FEATURES], train.y)
    raw = model.predict_proba(candidates[FEATURES])[:, 1]
    train_rate = (float(train.y.sum()) + 2.0) / (len(train) + 4.0)
    calibrated = np.clip(0.90 * raw + 0.10 * train_rate, 1e-6, 1 - 1e-6)
    candidates = candidates.copy()
    candidates["raw_probability"] = raw
    candidates["probability"] = calibrated
    candidates["tagged"] = calibrated >= ACTION_THRESHOLD
    tagged = candidates[candidates.tagged].sort_values(
        ["probability", "player_name"], ascending=[False, True]
    )
    out = {
        "schema_version": "draft_night_provisional_breakout_v1",
        "target_season": 2026,
        "feature_season": 2025,
        "status": "provisional_research_only",
        "model_id": "breakout_v1_4_frozen_2026_09_08",
        "probability_target": "ros_tier_jump",
        "action_threshold": ACTION_THRESHOLD,
        "training_rows": int(len(train)),
        "training_positive_events": int(train.y.sum()),
        "training_smoothed_event_rate": float(train_rate),
        "source_artifact_sha256": EXPECTED_SHA256,
        "holdout_evidence": {
            "precision": 0.4166666666666667,
            "recall": 0.47619047619047616,
            "lift": 2.1825396825396823,
            "positive_events": 21,
            "certified": False,
            "reason": "Failed only preregistered >=30 unseen positive-event count gate.",
        },
        "tags": [
            {
                "playerId": str(r.player_id),
                "playerName": str(r.player_name),
                "team": None if pd.isna(r.team) else str(r.team),
                "targetSeason": 2026,
                "label": "2026 Breakout Research",
                "displayLabel": f"2026 Breakout · {round(float(r.probability) * 100):d}%",
                "probability": {
                    "value": float(r.probability),
                    "percent": round(float(r.probability) * 100),
                    "target": "ros_tier_jump",
                },
                "probabilities": {
                    "primary": float(r.probability),
                    "primaryTarget": "ros_tier_jump",
                    "top12Next4w": None,
                    "top24Next4w": None,
                    "rosTierJump": float(r.probability),
                    "adpOutperformance12Slots": None,
                    "roleExpansion": None,
                },
                "candidateRank": rank,
                "finalSignalScore": None,
                "breakoutContext": "Frozen v1.4 research probability from 2025 production, role, development and draft-capital evidence.",
                "modelVersion": "breakout_v1_4_frozen_2026_09_08",
                "generatedAt": "2026-09-08T16:18:00Z",
                "evidenceStatus": "provisional_research_only",
            }
            for rank, r in enumerate(tagged.itertuples(index=False), start=1)
        ],
    }
    print("=== BREAKOUT_2026_PROVISIONAL_JSON ===")
    print(json.dumps(out, indent=2))
    print("=== END_BREAKOUT_2026_PROVISIONAL_JSON ===")


if __name__ == "__main__":
    main()
