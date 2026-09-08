from __future__ import annotations

import json
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

DATA_URL = (
    "https://raw.githubusercontent.com/Prometheus-Frameworks/Signal-Validation-Model/"
    "main/outputs/validation_reports/wr_validation_dataset_role_enriched.csv"
)
OUT_DIR = Path("outputs/research/breakout_v1_3_calibration")
FEATURES = ["feature_ppg", "feature_targets_per_game", "feature_games_played", "log_feature_finish", "expected_ppg_baseline"]


def tier(v):
    if v <= 12: return 1
    if v <= 24: return 2
    if v <= 36: return 3
    if v <= 48: return 4
    return 5


def population(df):
    w = df.copy()
    for c in ["feature_season","feature_games_played","outcome_games_played","feature_ppg","feature_targets_per_game","feature_finish","outcome_finish","expected_ppg_baseline"]:
        w[c] = pd.to_numeric(w[c], errors="coerce")
    w = w[
        w["has_valid_outcome"].astype(str).str.lower().eq("true")
        & w.feature_games_played.ge(4) & w.outcome_games_played.ge(8)
        & w.feature_finish.notna() & w.outcome_finish.notna() & w.feature_finish.gt(12)
    ].copy()
    w["feature_tier"] = w.feature_finish.map(tier)
    w["outcome_tier"] = w.outcome_finish.map(tier)
    w["y"] = (w.outcome_tier < w.feature_tier).astype(int)
    w["log_feature_finish"] = np.log1p(w.feature_finish)
    return w


def model():
    prep = ColumnTransformer([("n", Pipeline([
        ("impute", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler()),
    ]), FEATURES)])
    return Pipeline([("prep", prep), ("m", LogisticRegression(C=10.0, max_iter=5000, solver="lbfgs", random_state=20260908))])


def clip(p): return np.clip(np.asarray(p, dtype=float), 1e-6, 1-1e-6)
def logit(p):
    p=clip(p); return np.log(p/(1-p))


def fit_platt(hist):
    if len(hist) < 20 or hist.y.nunique() < 2: return None
    m=LogisticRegression(C=1e6, solver="lbfgs", max_iter=5000, random_state=20260908)
    m.fit(logit(hist.raw.to_numpy()).reshape(-1,1), hist.y.to_numpy(dtype=int))
    return m


def apply_platt(m,p):
    if m is None: return clip(p)
    return clip(m.predict_proba(logit(p).reshape(-1,1))[:,1])


def fit_intercept_only(hist):
    # Bayesian-smoothed historical event rate, used only to shrink current raw probabilities.
    if hist.empty: return None
    positives=float(hist.y.sum()); n=float(len(hist))
    return (positives + 2.0) / (n + 4.0)


def shrink_probs(raw, hist_rate, strength):
    if hist_rate is None: return clip(raw)
    # Convex probability shrinkage; strength 0 = raw, 1 = historical base rate.
    return clip((1.0-strength)*clip(raw) + strength*hist_rate)


def metrics(y,p):
    return {
        "n": int(len(y)), "positive_events": int(np.sum(y)), "base_rate": float(np.mean(y)),
        "brier_score": float(brier_score_loss(y,p)),
        "log_loss": float(log_loss(y,clip(p),labels=[0,1])),
        "pr_auc": float(average_precision_score(y,p)),
    }


def main():
    OUT_DIR.mkdir(parents=True,exist_ok=True)
    with urlopen(DATA_URL,timeout=60) as r: raw_bytes=r.read()
    path=OUT_DIR/"source.csv"; path.write_bytes(raw_bytes)
    d=population(pd.read_csv(path))
    seasons=sorted(int(x) for x in d.feature_season.unique())
    hist=pd.DataFrame(columns=["feature_season","y","raw"])
    rows=[]
    fold_reports=[]
    for s in seasons[1:]:
        tr=d[d.feature_season < s]; va=d[d.feature_season == s]
        m=model(); m.fit(tr[FEATURES],tr.y)
        raw=clip(m.predict_proba(va[FEATURES])[:,1])
        platt=apply_platt(fit_platt(hist),raw)
        rate=fit_intercept_only(hist)
        variants={"raw":raw,"online_platt":platt}
        for strength in [0.05,0.10,0.15,0.20,0.25,0.30]:
            variants[f"shrink_{strength:.2f}"]=shrink_probs(raw,rate,strength)
        y=va.y.to_numpy(dtype=int)
        fold_reports.append({"season":s,"history_rows":int(len(hist)),"historical_smoothed_rate":rate,"variants":{k:metrics(y,p) for k,p in variants.items()}})
        for i,(_,r) in enumerate(va.iterrows()):
            record={"feature_season":s,"y":int(y[i]),"raw":float(raw[i])}
            for k,p in variants.items(): record[k]=float(p[i])
            rows.append(record)
        hist=pd.concat([hist,pd.DataFrame({"feature_season":s,"y":y,"raw":raw})],ignore_index=True)
    out=pd.DataFrame(rows); out.to_csv(OUT_DIR/"oof_calibration_predictions.csv",index=False)
    variant_names=[c for c in out.columns if c not in {"feature_season","y"}]
    aggregate={k:metrics(out.y.to_numpy(dtype=int),out[k].to_numpy(dtype=float)) for k in variant_names}
    winner=min(aggregate.items(),key=lambda kv:(kv[1]["log_loss"],kv[1]["brier_score"],-kv[1]["pr_auc"],kv[0]))
    report={
        "status":"development_only_not_certification",
        "model":"v1_baseline_logistic_unchanged",
        "chronological_calibration_protocol":"Each validation season is predicted from earlier feature seasons only. Platt/shrinkage parameters use only predictions/outcomes from still-earlier validation seasons.",
        "folds":fold_reports,
        "aggregate":aggregate,
        "winner":{"name":winner[0],"metrics":winner[1]},
        "note":"Calibration choice is development-only because 2023->2024 has already been inspected. Freeze any selected method before evaluating the next genuinely unseen outcome season."
    }
    (OUT_DIR/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("=== BREAKOUT_V1_3_CALIBRATION_REPORT_JSON ===")
    print(json.dumps(report,indent=2))
    print("=== END_BREAKOUT_V1_3_CALIBRATION_REPORT_JSON ===")

if __name__=="__main__": main()
