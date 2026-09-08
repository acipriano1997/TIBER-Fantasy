from __future__ import annotations

import hashlib
import json
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
OUT = Path("outputs/research/breakout_v1_4_unseen_2025")
ACTION_THRESHOLD = 0.25
FULL_FEATURES = [
    "feature_ppg", "feature_targets_per_game", "feature_games_played",
    "log_feature_finish", "expected_ppg_baseline",
    "feature_target_share", "feature_air_yards_share", "feature_wopr",
    "feature_racr", "feature_receiving_yards_per_target", "feature_catch_rate",
    "feature_season_age", "feature_career_year", "feature_draft_pick",
]
BASE_FEATURES = [
    "feature_ppg", "feature_targets_per_game", "feature_games_played",
    "log_feature_finish", "expected_ppg_baseline",
]


def safe_num(v):
    try:
        if v is None: return np.nan
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
    records = [r for r in payload["records"] if r.get("position") == "WR" and r.get("season_type") == "REG"]
    seasons = sorted({int(r["season"]) for r in records})
    if seasons != [2021, 2022, 2023, 2024, 2025]:
        raise RuntimeError(f"unexpected WR seasons: {seasons}")
    return records


def season_frame(records):
    rows=[]
    for r in records:
        prod=r.get("production_summary") or {}; usage=r.get("usage_summary") or {}
        games=safe_num(r.get("games_played"))
        if not np.isfinite(games): games=safe_num(prod.get("games_for_ppg"))
        ppg=safe_num(prod.get("season_ppg")); total=safe_num(prod.get("season_ppr"))
        targets=safe_num(usage.get("targets")); receptions=safe_num(usage.get("receptions"))
        receiving_yards=safe_num((prod.get("receiving") or {}).get("receiving_yards"))
        tpg=targets/games if np.isfinite(targets) and np.isfinite(games) and games>0 else np.nan
        catch=receptions/targets if np.isfinite(receptions) and np.isfinite(targets) and targets>0 else np.nan
        ypt=receiving_yards/targets if np.isfinite(receiving_yards) and np.isfinite(targets) and targets>0 else np.nan
        rows.append({
            "player_id":r["player_id"],"player_name":r["player_name"],"season":int(r["season"]),
            "games_played":games,"season_ppg":ppg,"season_ppr":total,"targets_per_game":tpg,
            "target_share":safe_num(usage.get("target_share")),"air_yards_share":safe_num(usage.get("air_yards_share")),
            "wopr":safe_num(usage.get("wopr")),"racr":safe_num(usage.get("racr")),
            "receiving_yards_per_target":ypt,"catch_rate":catch,"season_age":safe_num(r.get("season_age")),
            "career_year":safe_num(r.get("career_year")),"draft_pick":safe_num(r.get("draft_pick")),
        })
    df=pd.DataFrame(rows)
    df["finish"]=np.nan
    for season,idx in df.groupby("season").groups.items():
        ordered=df.loc[idx].sort_values(["season_ppg","season_ppr","player_id"],ascending=[False,False,True],kind="mergesort")
        df.loc[ordered.index,"finish"]=np.arange(1,len(ordered)+1)
    return df


def tier(f):
    if f<=12:return 1
    if f<=24:return 2
    if f<=36:return 3
    if f<=48:return 4
    return 5


def build_pairs(df):
    by={(r.player_id,int(r.season)):r for r in df.itertuples(index=False)}
    out=[]
    for r in df.itertuples(index=False):
        fs=int(r.season); os=fs+1
        if os>2025: continue
        o=by.get((r.player_id,os))
        if o is None: continue
        if not (np.isfinite(r.games_played) and r.games_played>=4 and np.isfinite(o.games_played) and o.games_played>=8): continue
        if not (np.isfinite(r.finish) and np.isfinite(o.finish)) or r.finish<=12: continue
        if not (np.isfinite(r.season_ppg) and np.isfinite(r.targets_per_game)): continue
        ts=r.target_share if np.isfinite(r.target_share) else 0.0
        expected=round(float(r.season_ppg)*0.7 + float(r.targets_per_game)*0.2 + float(ts)*10.0,4)
        out.append({
            "player_id":r.player_id,"player_name":r.player_name,"feature_season":fs,"outcome_season":os,
            "feature_ppg":r.season_ppg,"feature_targets_per_game":r.targets_per_game,"feature_games_played":r.games_played,
            "log_feature_finish":np.log1p(r.finish),"expected_ppg_baseline":expected,
            "feature_target_share":r.target_share,"feature_air_yards_share":r.air_yards_share,"feature_wopr":r.wopr,
            "feature_racr":r.racr,"feature_receiving_yards_per_target":r.receiving_yards_per_target,"feature_catch_rate":r.catch_rate,
            "feature_season_age":r.season_age,"feature_career_year":r.career_year,"feature_draft_pick":r.draft_pick,
            "feature_finish":int(r.finish),"outcome_finish":int(o.finish),"y":int(tier(o.finish)<tier(r.finish)),
        })
    return pd.DataFrame(out)


def make_model(features,C=5.0):
    prep=ColumnTransformer([("num",Pipeline([
        ("impute",SimpleImputer(strategy="median",add_indicator=True)),
        ("scale",StandardScaler()),
    ]),features)],remainder="drop")
    return Pipeline([("prep",prep),("model",LogisticRegression(C=C,class_weight=None,max_iter=5000,solver="lbfgs",random_state=20260908))])


def training_rate(train_y):
    return (float(np.sum(train_y))+2.0)/(len(train_y)+4.0)


def calibrate(raw,train_y):
    return np.clip(0.90*np.asarray(raw,dtype=float)+0.10*training_rate(train_y),1e-6,1-1e-6)


def confusion(y,p,threshold=ACTION_THRESHOLD):
    pred=(p>=threshold).astype(int)
    tn,fp,fn,tp=confusion_matrix(y,pred,labels=[0,1]).ravel()
    return int(tp),int(fp),int(fn),int(tn),pred


def metrics(y,p):
    tp,fp,fn,tn,pred=confusion(y,p)
    precision=tp/(tp+fp) if tp+fp else 0.0; recall=tp/(tp+fn) if tp+fn else 0.0; base=float(np.mean(y))
    return {
        "threshold":ACTION_THRESHOLD,"n":int(len(y)),"positive_events":int(np.sum(y)),"tagged":int(np.sum(pred)),
        "tp":tp,"fp":fp,"fn":fn,"tn":tn,"precision":float(precision),"recall":float(recall),
        "base_rate":base,"lift":float(precision/base) if base else 0.0,
        "brier_score":float(brier_score_loss(y,p)),"log_loss":float(log_loss(y,p,labels=[0,1])),
        "pr_auc":float(average_precision_score(y,p)),
    }


def lift_bootstrap_lower95(y,p,iterations=20000):
    y=np.asarray(y,dtype=int); pred=(np.asarray(p)>=ACTION_THRESHOLD).astype(int); n=len(y)
    rng=np.random.default_rng(20260908); vals=[]
    for _ in range(iterations):
        idx=rng.integers(0,n,n); ys=y[idx]; ps=pred[idx]
        positives=int(ys.sum()); tagged=int(ps.sum())
        if positives==0 or tagged==0: continue
        tp=int(np.sum((ys==1)&(ps==1))); precision=tp/tagged; base=positives/n
        vals.append(precision/base)
    if len(vals)<iterations*0.9:
        raise RuntimeError("insufficient valid bootstrap lift samples")
    arr=np.asarray(vals)
    return {"method":"nonparametric_row_bootstrap","iterations":iterations,"valid_iterations":len(vals),"lower_95":float(np.quantile(arr,0.025)),"median":float(np.quantile(arr,0.5)),"upper_95":float(np.quantile(arr,0.975))}


def constant_metrics(y,prob):
    p=np.full(len(y),float(prob),dtype=float)
    return {"probability":float(prob),"brier_score":float(brier_score_loss(y,p)),"log_loss":float(log_loss(y,p,labels=[0,1]))}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    records=load_records(); df=season_frame(records); pairs=build_pairs(df)
    train=pairs[pairs.feature_season<=2023].copy(); hold=pairs[pairs.feature_season==2024].copy()
    if train.empty or hold.empty or set(hold.outcome_season.unique())!={2025}:
        raise RuntimeError("frozen 2024->2025 holdout unavailable")
    # Frozen champion.
    champion=make_model(FULL_FEATURES,C=5.0); champion.fit(train[FULL_FEATURES],train.y)
    champ_raw=champion.predict_proba(hold[FULL_FEATURES])[:,1]; champ_p=calibrate(champ_raw,train.y.to_numpy(dtype=int))
    # Frozen simple challenger from preregistration.
    challenger=make_model(BASE_FEATURES,C=5.0); challenger.fit(train[BASE_FEATURES],train.y)
    challenger_raw=challenger.predict_proba(hold[BASE_FEATURES])[:,1]; challenger_p=calibrate(challenger_raw,train.y.to_numpy(dtype=int))
    y=hold.y.to_numpy(dtype=int)
    champ=metrics(y,champ_p); chall=metrics(y,challenger_p)
    lift_ci=lift_bootstrap_lower95(y,champ_p)
    train_rate=training_rate(train.y.to_numpy(dtype=int)); hold_rate=float(np.mean(y))
    frozen_constant=constant_metrics(y,train_rate); oracle_constant=constant_metrics(y,hold_rate)
    ledger=hold[["player_id","player_name","feature_season","outcome_season","feature_finish","outcome_finish","y"]].copy()
    ledger["raw_probability"]=champ_raw; ledger["calibrated_probability"]=champ_p; ledger["predicted_breakout"]=(champ_p>=ACTION_THRESHOLD).astype(int)
    ledger.to_csv(OUT/"holdout_predictions.csv",index=False)
    checks={
        "positive_events_at_least_30":champ["positive_events"]>=30,
        "precision_at_least_15pct":champ["precision"]>=0.15,
        "lift_gt_1_5":champ["lift"]>1.5,
        "lift_lower_95_gt_1":lift_ci["lower_95"]>1.0,
        "brier_beats_oracle_base_rate":champ["brier_score"]<oracle_constant["brier_score"],
        "log_loss_beats_oracle_base_rate":champ["log_loss"]<oracle_constant["log_loss"],
        "brier_beats_simple_challenger":champ["brier_score"]<chall["brier_score"],
        "log_loss_beats_simple_challenger":champ["log_loss"]<chall["log_loss"],
    }
    checks["all_numeric_gates_passed"]=all(checks.values())
    report={
        "status":"unseen_2024_to_2025_holdout_evaluated_once",
        "spec":"research/breakout_v1_4_frozen_spec.json",
        "artifact_sha256":EXPECTED_SHA256,
        "chronology":{"training_feature_seasons":sorted(int(x) for x in train.feature_season.unique()),"holdout_feature_season":2024,"holdout_outcome_season":2025,"holdout_used_in_selection":False},
        "training":{"n":int(len(train)),"positive_events":int(train.y.sum()),"smoothed_event_rate":train_rate},
        "champion":champ,"precision_lift_95":lift_ci,
        "simple_challenger":chall,
        "frozen_training_rate_constant_baseline":frozen_constant,
        "oracle_holdout_base_rate_constant_baseline":oracle_constant,
        "certification_checks":checks,
        "certification_result":"pass" if checks["all_numeric_gates_passed"] else "fail",
        "governance":"Research-only. A numeric pass would still require independent producer review/promotion before any Fantasy consumer activation."
    }
    (OUT/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("=== BREAKOUT_V1_4_UNSEEN_2025 ===")
    print(json.dumps(report,indent=2))
    print("=== END_BREAKOUT_V1_4_UNSEEN_2025 ===")

if __name__=="__main__": main()
