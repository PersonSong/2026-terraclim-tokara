import pandas as pd

files = [
    "pipeline_raw/zonal_stats_wide.csv",
    "pipeline_raw/zonal_stats_long.csv",
    "pipeline_raw/block_depletion.csv",
]

for path in files:
    df = pd.read_csv(path)
    df["season"] = df["season"].str.replace("_", "/", regex=False)
    df.to_csv(path, index=False)
    print(f"Fixed season format in {path}")