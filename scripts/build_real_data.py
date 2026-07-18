"""
Build backend/data/{blocks.geojson, daily_status.json, phenology_stage.json}
from the real Tokara vineyard shapefile and ET/phenology pipeline outputs,
replacing the 9-block mock dataset entirely.

Run with the scripts/ venv (has geopandas/pandas installed):
    scripts/.venv/Scripts/python.exe scripts/build_real_data.py
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

# Windows consoles often default to a non-UTF-8 codepage, which garbles the
# em-dashes used throughout this script's summary output.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parent.parent

SHAPEFILE_PATH = Path(
    r"C:\Users\amyfe\OneDrive\Documents\UWC_thirdyear\ET-Geo Hackathon\Hackathon\Shapefiles\Tokara_Polygons.shp"
)
ZONAL_STATS_WIDE_PATH = REPO_ROOT / "pipeline_raw" / "zonal_stats_wide.csv"
PHENOLOGY_VALIDATION_PATH = REPO_ROOT / "outputPH" / "phenology_validation.csv"

BLOCKS_GEOJSON_PATH = REPO_ROOT / "backend" / "data" / "blocks.geojson"
DAILY_STATUS_PATH = REPO_ROOT / "backend" / "data" / "daily_status.json"
PHENOLOGY_STAGE_PATH = REPO_ROOT / "backend" / "data" / "phenology_stage.json"

DAILY_STATUS_COLUMNS = [
    "date", "season", "block_id", "cultivar", "eto_mm", "eta_mm", "kc", "ndvi",
    "depletion_mm", "status", "recorded_stage", "implied_stage", "trust_label",
]


def print_header(title: str) -> None:
    print("=" * 70)
    print(title)
    print("=" * 70)


def step1_build_blocks_geojson() -> gpd.GeoDataFrame:
    print_header("STEP 1 — Real blocks.geojson")

    gdf = gpd.read_file(SHAPEFILE_PATH)
    original_crs = gdf.crs

    if gdf.crs is None:
        raise ValueError(f"Shapefile has no CRS defined: {SHAPEFILE_PATH}")

    if gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)
        print(f"Reprojected from {original_crs} to EPSG:4326 (WGS84).")
    else:
        print("Already in EPSG:4326 (WGS84) — no reprojection needed.")

    gdf_out = gdf[["BLOCK", "CULTIVAR", "geometry"]].copy()

    BLOCKS_GEOJSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    if BLOCKS_GEOJSON_PATH.exists():
        BLOCKS_GEOJSON_PATH.unlink()
    gdf_out.to_file(BLOCKS_GEOJSON_PATH, driver="GeoJSON")

    n_unique_blocks = gdf_out["BLOCK"].nunique()
    dup_blocks = sorted(gdf_out.loc[gdf_out["BLOCK"].duplicated(keep=False), "BLOCK"].unique())

    print(f"Wrote {len(gdf_out)} block polygons to {BLOCKS_GEOJSON_PATH.relative_to(REPO_ROOT)}")
    print(f"  {n_unique_blocks} unique BLOCK codes")
    if dup_blocks:
        print(f"  {len(dup_blocks)} BLOCK code(s) have more than one polygon (mixed/sub-parcel plantings): {dup_blocks}")
    print()
    return gdf_out


def step2_merge_real_data() -> pd.DataFrame:
    print_header("STEP 2 — Merge real data")

    wide = pd.read_csv(ZONAL_STATS_WIDE_PATH, dtype={"block_id": str, "season": str, "date": str})
    validation = pd.read_csv(PHENOLOGY_VALIDATION_PATH, dtype={"block_id": str, "season": str, "date": str})

    print(f"Loaded {len(wide)} rows from pipeline_raw/zonal_stats_wide.csv")
    print(f"Loaded {len(validation)} rows from outputPH/phenology_validation.csv")

    merged = pd.merge(
        validation[[
            "block_id", "season", "date", "ETa", "depletion_mm",
            "recorded_stage", "implied_stage", "trust_label", "status",
        ]],
        wide[["block_id", "season", "date", "ETo", "Kc", "NDVI"]],
        on=["block_id", "season", "date"],
        how="left",
        indicator=True,
    )

    n_no_wide_match = int((merged["_merge"] == "left_only").sum())
    merged = merged.drop(columns="_merge")

    print(f"Merged on (block_id, season, date) -> {len(merged)} rows "
          f"(validation is the base; {len(validation)} validation rows in, {len(merged)} out)")
    if n_no_wide_match > 0:
        print(f"  {n_no_wide_match} validation rows had no matching wide-table row "
              f"(ETo/Kc/NDVI left null for those).")
    else:
        print("  Every validation row found a matching wide-table row.")
    print()
    return merged


def step3_attach_cultivar(merged: pd.DataFrame, blocks_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    print_header("STEP 3 — Attach cultivar")

    cultivar_lookup = dict(zip(blocks_gdf["BLOCK"], blocks_gdf["CULTIVAR"]))
    dup_blocks = sorted(blocks_gdf.loc[blocks_gdf["BLOCK"].duplicated(), "BLOCK"].unique())
    if dup_blocks:
        print(f"Note: {len(dup_blocks)} BLOCK code(s) map to more than one cultivar in blocks.geojson; "
              f"the lookup keeps the last cultivar listed for each: {dup_blocks}")

    merged = merged.copy()
    merged["cultivar"] = merged["block_id"].map(cultivar_lookup)

    unmatched_mask = merged["cultivar"].isna()
    n_unmatched = int(unmatched_mask.sum())
    if n_unmatched > 0:
        sample_ids = sorted(merged.loc[unmatched_mask, "block_id"].unique())[:10]
        print(f"{n_unmatched} rows had no matching block_id in blocks.geojson and were dropped.")
        print(f"  Sample dropped block_ids: {sample_ids}")
    else:
        print("Every row matched a block_id in blocks.geojson — nothing dropped.")

    merged = merged.loc[~unmatched_mask].copy()
    print(f"{len(merged)} rows remain after dropping unmatched block_ids.")
    print()
    return merged


def step4_write_daily_status(df: pd.DataFrame) -> pd.DataFrame:
    print_header("STEP 4 — Rename to match the existing contract")

    out = df.rename(columns={"ETo": "eto_mm", "ETa": "eta_mm", "Kc": "kc", "NDVI": "ndvi"})
    out = out[DAILY_STATUS_COLUMNS].sort_values(["block_id", "date"]).reset_index(drop=True)

    records = json.loads(out.to_json(orient="records"))

    DAILY_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DAILY_STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(records)} rows to {DAILY_STATUS_PATH.relative_to(REPO_ROOT)}")
    print(f"  Columns: {DAILY_STATUS_COLUMNS}")
    print(f"  Blocks: {out['block_id'].nunique()}, dates: {out['date'].nunique()}, "
          f"seasons: {sorted(out['season'].unique())}")
    print()
    return out


def humanize_stage(value) -> str | None:
    """snake_case/underscored stage strings -> readable text; None if missing.

    Deliberately checks pd.isna(value) alone (not `is None`/`isinstance(..., float)`):
    pandas 3.0's default Arrow-backed string dtype represents missing values in
    ways that don't reliably survive Series.map() as a plain None, so this must
    be run over plain Python values (see step5's use of .tolist()) with a
    pd.isna()-only check to catch every NA representation.
    """
    if pd.isna(value):
        return None
    return str(value).replace("_", " ")


def build_phenology_note(recorded: str | None, implied: str | None, trust_label: str) -> str:
    if trust_label == "agrees":
        return f"Model agrees with recorded {recorded} timing"
    if trust_label == "disagrees":
        return f"Satellite trend suggests {implied}, differing from the recorded {recorded} stage"
    if trust_label == "stage-record-incomplete":
        if recorded is None:
            return "Phenology record incomplete for this block"
        return "Satellite trend inconclusive for this date"
    return "Status unavailable"


def step5_derive_phenology(df: pd.DataFrame) -> None:
    print_header("STEP 5 — Derive phenology_stage.json")

    # .tolist() forces plain Python values so humanize_stage's pd.isna() check
    # sees every NA row — pandas 3.0's Arrow-backed string dtype does not
    # reliably apply a None-returning function to NA entries via Series.map().
    recorded_list = [humanize_stage(v) for v in df["recorded_stage"].tolist()]
    implied_list = [humanize_stage(v) for v in df["implied_stage"].tolist()]

    phenology_rows = []
    for recorded, implied, trust_label, block_id, date in zip(
        recorded_list, implied_list, df["trust_label"], df["block_id"], df["date"]
    ):
        stage = recorded or implied or "unknown"
        note = build_phenology_note(recorded, implied, trust_label)
        phenology_rows.append({
            "block_id": block_id,
            "date": date,
            "stage": stage,
            "phenology_note": note,
        })

    PHENOLOGY_STAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PHENOLOGY_STAGE_PATH, "w", encoding="utf-8") as f:
        json.dump(phenology_rows, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(phenology_rows)} rows to {PHENOLOGY_STAGE_PATH.relative_to(REPO_ROOT)}")
    print("Breakdown by trust_label:")
    for label, count in df["trust_label"].value_counts().items():
        print(f"  {label}: {count}")
    n_unknown_stage = sum(1 for row in phenology_rows if row["stage"] == "unknown")
    print(f"Rows with stage='unknown' (both recorded_stage and implied_stage missing): {n_unknown_stage}")
    print()


def step6_suggest_demo_date(df: pd.DataFrame) -> None:
    print_header("STEP 6 — Suggest a demo date")

    irrigate_counts = (
        df[df["status"] == "irrigate"]
        .groupby("date")["block_id"]
        .nunique()
        .rename("irrigate_block_count")
        .reset_index()
    )
    candidates = irrigate_counts[irrigate_counts["irrigate_block_count"] >= 3]
    candidates = candidates.sort_values("date", ascending=False).head(10)

    if candidates.empty:
        print("No dates found where at least 3 blocks are flagged 'irrigate'.")
    else:
        print("10 most recent dates with >= 3 blocks flagged 'irrigate':")
        for _, row in candidates.iterrows():
            print(f"  {row['date']}: {row['irrigate_block_count']} blocks")
    print()


def main() -> None:
    blocks_gdf = step1_build_blocks_geojson()
    merged = step2_merge_real_data()
    merged = step3_attach_cultivar(merged, blocks_gdf)
    daily_status_df = step4_write_daily_status(merged)
    step5_derive_phenology(daily_status_df)
    step6_suggest_demo_date(daily_status_df)

    print_header("DONE")
    print("blocks.geojson, daily_status.json, and phenology_stage.json have been replaced with real data.")


if __name__ == "__main__":
    main()
