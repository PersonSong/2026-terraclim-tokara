import sys
sys.path.insert(0, "scripts")

import pandas as pd
from phenology_validation import load_stage_windows, compute_stage_aware_depletion

PHENO_XLSX_PATH = "pipeline_raw/Tokara_Pheno_Data.xlsx"

wide_df = pd.read_csv("pipeline_raw/zonal_stats_wide.csv", parse_dates=["date"])
stage_windows = load_stage_windows(path=PHENO_XLSX_PATH)

compute_stage_aware_depletion(wide_df, stage_windows)