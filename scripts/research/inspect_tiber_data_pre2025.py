from __future__ import annotations

import hashlib
import json
from collections import Counter
from urllib.request import urlopen

URL = "https://raw.githubusercontent.com/Prometheus-Frameworks/TIBER-Data/main/exports/promoted/nfl/player_season_coverage_v0.json"
EXPECTED_SHA256 = "d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac"

with urlopen(URL, timeout=120) as response:
    raw = response.read()
actual = hashlib.sha256(raw).hexdigest()
if actual != EXPECTED_SHA256:
    raise SystemExit(f"artifact sha mismatch: {actual}")
payload = json.loads(raw)
records = [
    r for r in payload["records"]
    if r.get("position") == "WR" and r.get("season_type") == "REG" and int(r.get("season", 9999)) <= 2024
]
# Hard assertion that no 2025 row can enter this inspection output.
assert all(int(r["season"]) <= 2024 for r in records)
print("pre2025_wr_records", len(records))
print("seasons", Counter(int(r["season"]) for r in records))
for container in ["production_summary", "usage_summary"]:
    keys = Counter()
    nonnull = 0
    samples = []
    for r in records:
        obj = r.get(container)
        if isinstance(obj, dict):
            nonnull += 1
            keys.update(obj.keys())
            if len(samples) < 2 and int(r["season"]) == 2024:
                samples.append({"season": r["season"], "player_name": r["player_name"], container: obj})
    print(container, "nonnull", nonnull)
    print(container, "keys", sorted(keys.items()))
    print(container, "samples", json.dumps(samples, sort_keys=True))
print("top_level_sample_keys", sorted(records[0].keys()))
