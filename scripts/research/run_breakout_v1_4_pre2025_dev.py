from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, confusion_matrix, log_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

URL = "https://raw.githubusercontent.com/Prometheus-Frameworks/TIBER-Data/main/exports/promoted/nfl/player_season_coverage_v0.json"
EXPECTED_SHA256 = "d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac"
OUT = Path("outputs/research/breakout_v1_4_pre2025_dev")
ACTION_THRESHOLD = 0.25

BASE_FEATURES = [
    "feature_ppg", "feature_targets_per_game", "feature_games_played",
    "log_feature_finish", "expected_ppg_baseline",
]
ROLE_FEATURES = BASE_FEATURES + ["feature_target_share", "feature_air_yards_share", "feature_wopr"]
ROLE_EFFICIENCY_FEATURES = ROLE_FEATURES + ["feature_racr", "feature_receiving_yards_per_target", "feature_catch_rate"]
DEVELOPMENT_FEATURES = ROLE_FEATURES + ["feature_season_age", "feature_career_year", "feature_draft_pick"]
FULL_FEATURES = ROLE_EFFICIENCY_FEATURES + ["feature_season_age", "feature_career_year", "feature_draft_pick"]


def safe_num(v):
    try:
        if v is None: return np.nan
        return float(v)
    except (TypeError, ValueError):
        return np.nan


def load_pre2025_records():
    with urlopen(URL, timeout=120) as response:
        raw = response.read()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != EXPECTED_SHA256:
        raise RuntimeError(f"artifact sha mismatch: {sha}")
    payload = json.loads(raw)
    records = [
        r for r in payload["records"]
        if r.get("position") == "WR" and r.get("season_type") == "REG" and int(r.get("season", 9999)) <= 2024
    ]
    assert records and all(int(r["season"]) <= 2024 for r in records)
    return records


def season_frame(records):
    rows=[]
    for r in records:
        prod=r.get("production_summary") or {}
        usage=r.get("usage_summary") or {}
        games=safe_num(r.get("games_played"))
        if not np.isfinite(games): games=safe_num(prod.get("games_for_ppg"))
        ppg=safe_num(prod.get("season_ppg")); total=safe_num(prod.get("season_ppr"))
        targets=safe_num(usage.get("targets")); receptions=safe_num(usage.get("receptions"))
        receiving_yards=safe_num((prod.get("receiving") or {}).get("receiving_yards"))
        targets_pg = targets/games if np.isfinite(targets) and np.isfinite(games) and games > 0 else np.nan
        catch_rate = receptions/targets if np.isfinite(receptions) and np.isfinite(targets) and targets > 0 else np.nan
        ypt = receiving_yards/targets if np.isfinite(receiving_yards) and np.isfinite(targets) and targets > 0 else np.nan
        rows.append({
            "player_id": r["player_id"], "player_name": r["player_name"], "season": int(r["season"]),
            "games_played": games, "season_ppg": ppg, "season_ppr": total,
            "targets_per_game": targets_pg, "target_share": safe_num(usage.get("target_share")),
            "air_yards_share": safe_num(usage.get("air_yards_share")), "wopr": safe_num(usage.get("wopr")),
            "racr": safe_num(usage.get("racr")), "receiving_yards_per_target": ypt, "catch_rate": catch_rate,
            "season_age": safe_num(r.get("season_age")), "career_year": safe_num(r.get("career_year")),
            "draft_pick": safe_num(r.get("draft_pick")),
        })
    df=pd.DataFrame(rows)
    # Producer-compatible finish: PPG descending, season PPR descending, player_id ascending.
    df["finish"]=np.nan
    for season, idx in df.groupby("season").groups.items():
        ordered=df.loc[idx].sort_values(["season_ppg","season_ppr","player_id"], ascending=[False,False,True], kind="mergesort")
        df.loc[ordered.index,"finish"]=np.arange(1,len(ordered)+1)
    return df


def tier(finish):
    if finish <= 12: return 1
    if finish <= 24: return 2
    if finish <= 36: return 3
    if finish <= 48: return 4
    return 5


def pairs(df):
    by={(r.player_id,int(r.season)):r for r in df.itertuples(index=False)}
    out=[]
    for r in df.itertuples(index=False):
        fs=int(r.season); os=fs+1
        if os > 2024: continue
        o=by.get((r.player_id,os))
        if o is None: continue
        if not (np.isfinite(r.games_played) and r.games_played >= 4 and np.isfinite(o.games_played) and o.games_played >= 8): continue
        if not (np.isfinite(r.finish) and np.isfinite(o.finish)) or r.finish <= 12: continue
        target_share = r.target_share if np.isfinite(r.target_share) else 0.0
        expected = round(float(r.season_ppg)*0.7 + float(r.targets_per_game)*0.2 + float(target_share)*10.0,4)
        out.append({
            "player_id":r.player_id,"player_name":r.player_name,"feature_season":fs,"outcome_season":os,
            "feature_ppg":r.season_ppg,"feature_targets_per_game":r.targets_per_game,"feature_games_played":r.games_played,
            "log_feature_finish":np.log1p(r.finish),"expected_ppg_baseline":expected,
            "feature_target_share":r.target_share,"feature_air_yards_share":r.air_yards_share,"feature_wopr":r.wopr,
            "feature_racr":r.racr,"feature_receiving_yards_per_target":r.receiving_yards_per_target,"feature_catch_rate":r.catch_rate,
            "feature_season_age":r.season_age,"feature_career_year":r.career_year,"feature_draft_pick":r.draft_pick,
            "feature_finish":int(r.finish),"outcome_finish":int(o.finish),
            "y":int(tier(o.finish)<tier(r.finish)),
        })
    frame=pd.DataFrame(out)
    assert not frame.empty and int(frame.outcome_season.max()) <= 2024
    return frame


def make_model(features,C):
    prep=ColumnTransformer([("num",Pipeline([
        ("impute",SimpleImputer(strategy="median",add_indicator=True)),
        ("scale",StandardScaler()),
    ]),features)],remainder="drop")
    return Pipeline([("prep",prep),("model",LogisticRegression(C=C,max_iter=5000,solver="lbfgs",random_state=20260908))])


def shrink(p,train_y):
    rate=(float(np.sum(train_y))+2.0)/(len(train_y)+4.0)
    return np.clip(0.90*np.asarray(p)+0.10*rate,1e-6,1-1e-6)


def metrics(y,p):
    pred=(p>=ACTION_THRESHOLD).astype(int)
    tn,fp,fn,tp=confusion_matrix(y,pred,labels=[0,1]).ravel()
    precision=tp/(tp+fp) if tp+fp else 0.0; recall=tp/(tp+fn) if tp+fn else 0.0; base=float(np.mean(y))
    return {
        "n":int(len(y)),"positive_events":int(np.sum(y)),"tp":int(tp),"fp":int(fp),"fn":int(fn),"tn":int(tn),
        "precision":float(precision),"recall":float(recall),"base_rate":base,"lift":float(precision/base) if base else 0.0,
        "brier_score":float(brier_score_loss(y,p)),"log_loss":float(log_loss(y,p,labels=[0,1])),
        "pr_auc":float(average_precision_score(y,p)),
    }


def eval_spec(data,name,features,C):
    seasons=sorted(int(x) for x in data.feature_season.unique())
    rows=[]; folds=[]
    for val in seasons[1:]:
        tr=data[data.feature_season<val]; va=data[data.feature_season==val]
        if tr.y.nunique()<2 or va.empty: continue
        m=make_model(features,C); m.fit(tr[features],tr.y)
        raw=m.predict_proba(va[features])[:,1]; p=shrink(raw,tr.y.to_numpy(dtype=int))
        y=va.y.to_numpy(dtype=int); met=metrics(y,p); folds.append({"feature_season":val,**met})
        rows.extend({"feature_season":val,"y":int(y[i]),"p":float(p[i])} for i in range(len(y)))
    oof=pd.DataFrame(rows); agg=metrics(oof.y.to_numpy(dtype=int),oof.p.to_numpy(dtype=float))
    return {"name":name,"features":features,"C":C,"folds":folds,"aggregate":agg}


def coverage(data):
    return {c:{str(int(s)):int(g[c].notna().sum()) for s,g in data.groupby("feature_season")} for c in FULL_FEATURES}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    rec=load_pre2025_records(); seasons=season_frame(rec); data=pairs(seasons)
    specs=[]
    feature_sets=[("baseline",BASE_FEATURES),("role",ROLE_FEATURES),("role_efficiency",ROLE_EFFICIENCY_FEATURES),("development",DEVELOPMENT_FEATURES),("full",FULL_FEATURES)]
    for label,features in feature_sets:
        for C in [0.05,0.1,0.5,1.0,5.0,10.0]:
            specs.append(eval_spec(data,f"{label}_C{C}",features,C))
    ranked=sorted(specs,key=lambda r:(r["aggregate"]["log_loss"],r["aggregate"]["brier_score"],-r["aggregate"]["pr_auc"],r["name"]))
    report={
        "status":"pre2025_development_only_no_2025_outcomes_used",
        "artifact_sha256":EXPECTED_SHA256,
        "pair_feature_seasons":sorted(int(x) for x in data.feature_season.unique()),
        "pair_rows":int(len(data)),"pair_positive_events":int(data.y.sum()),
        "action_threshold":ACTION_THRESHOLD,"calibration":"10pct shrink toward training-fold smoothed event rate",
        "coverage_nonnull_by_feature_season":coverage(data),
        "winner":ranked[0],"baseline_best":next(r for r in ranked if r["name"].startswith("baseline_")),
        "top_10":ranked[:10],
        "holdout_safety":{"max_outcome_season_used":int(data.outcome_season.max()),"season_2025_used":False},
    }
    (OUT/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("=== BREAKOUT_V1_4_PRE2025_DEV ===")
    print(json.dumps(report,indent=2))
    print("=== END_BREAKOUT_V1_4_PRE2025_DEV ===")

if __name__=="__main__": main()
