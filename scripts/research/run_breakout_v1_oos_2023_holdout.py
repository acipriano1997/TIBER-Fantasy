from scripts.research import run_breakout_v1_oos as runner

# The producer artifact contains 2024 feature rows, but their 2025 outcomes are explicitly
# missing. The latest honest untouched holdout with completed outcomes is therefore
# 2023 features -> 2024 outcomes.
runner.FINAL_HOLDOUT_FEATURE_SEASON = 2023

if __name__ == "__main__":
    runner.main()
