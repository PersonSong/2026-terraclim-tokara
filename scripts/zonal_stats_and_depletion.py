"""
Zonal statistics + water-balance depletion pipeline — ET-GEO Hackathon

STEP 1  Load vineyard block polygons, check/match CRS against the rasters
STEP 2  For each variable (ETo, ETa, Kc, NDVI), compute the per-block mean
        on every date a raster exists for it
STEP 3  Combine everything into one long table, then pivot to a wide table
        (one row per block per date, one column per variable)
STEP 4  Walk each block's daily ETa chronologically to build a running
        water-balance depletion, and flag irrigate / review / hold

Install requirements first:
    pip install geopandas rasterio rasterstats pandas
"""

import glob
import os
from datetime import datetime

import geopandas as gpd
import pandas as pd
from rasterstats import zonal_stats

# ---------------------------------------------------------------------------
# CONFIG — adjust these to match your actual folder/file structure and
# filename pattern. Nothing below this block should need to change.
# ---------------------------------------------------------------------------
BLOCK_POLYGONS_PATH = "data/tokara_blocks.shp"   # vineyard block polygons
BLOCK_ID_FIELD = "block_code"                    # column in the shapefile with block IDs

RASTER_FOLDERS = {
    "ETo": "data/ETo/",      # daily rasters, every day of the season
    "ETa": "data/ETa/",      # daily rasters, already gap-filled to every day
    "Kc":  "data/Kc/",       # satellite-date rasters only
    "NDVI": "data/NDVI/",    # satellite-date rasters only
}

def date_from_filename("ETa_Tokara_2022-08-28_10m.tif"):
    """Adjust this to match your actual filename pattern, e.g. 'ETa_20230814.tif'."""
    stem = os.path.basename("ETa_Tokara_2022-08-28_10m.tif").split("_")[-1].replace(".tif", "")
    return datetime.strptime(stem, "%Y%m%d")

OUTPUT_LONG_CSV = "outputs/zonal_stats_long.csv"
OUTPUT_WIDE_CSV = "outputs/zonal_stats_wide.csv"
OUTPUT_DEPLETION_CSV = "outputs/block_depletion.csv"

# Water-balance parameters — treat these as starting points, not final numbers.
# Worth checking against your lecturer's input on realistic thresholds for
# these cultivars/stages rather than leaving them as guesses.
REFILL_LEVEL_MM = 0.0        # depletion resets to this after an irrigate flag
STRESS_THRESHOLD_MM = 25.0   # cumulative deficit (mm) that triggers "irrigate"
REVIEW_THRESHOLD_MM = 15.0   # deficit that triggers "review" (not yet urgent)


# ---------------------------------------------------------------------------
# STEP 1 — Load block polygons and match CRS to the rasters
# ---------------------------------------------------------------------------
def load_blocks(path=BLOCK_POLYGONS_PATH):
    blocks = gpd.read_file(path)
    print(f"Loaded {len(blocks)} block polygons, CRS: {blocks.crs}")
    return blocks


def match_crs(blocks, sample_raster_path):
    """Reproject the polygons to match the raster CRS if they don't already."""
    import rasterio
    with rasterio.open(sample_raster_path) as src:
        raster_crs = src.crs
    if blocks.crs != raster_crs:
        print(f"Reprojecting blocks: {blocks.crs} -> {raster_crs}")
        blocks = blocks.to_crs(raster_crs)
    return blocks


# ---------------------------------------------------------------------------
# STEP 2 — Zonal stats for one variable, across every date it has a raster
# ---------------------------------------------------------------------------
def zonal_stats_for_variable(blocks, variable_name, folder):
    raster_files = sorted(glob.glob(os.path.join(folder, "*.tif")))
    rows = []
    for raster_path in raster_files:
        date = date_from_filename(raster_path)
        stats = zonal_stats(
            blocks,
            raster_path,
            stats=["mean"],
            geojson_out=False,
            nodata=None,  # set this explicitly if your rasters use a specific nodata value
        )
        for block_row, stat in zip(blocks.itertuples(), stats):
            rows.append({
                "block_id": getattr(block_row, BLOCK_ID_FIELD),
                "date": date,
                "variable": variable_name,
                "value": stat["mean"],
            })
    return rows


# ---------------------------------------------------------------------------
# STEP 3 — Combine all variables into one long table, then pivot wide
# ---------------------------------------------------------------------------
def build_zonal_stats_table(blocks):
    all_rows = []
    for variable_name, folder in RASTER_FOLDERS.items():
        print(f"Processing {variable_name}...")
        all_rows.extend(zonal_stats_for_variable(blocks, variable_name, folder))

    long_df = pd.DataFrame(all_rows)
    long_df.to_csv(OUTPUT_LONG_CSV, index=False)
    print(f"Wrote {OUTPUT_LONG_CSV} ({len(long_df)} rows)")

    wide_df = long_df.pivot_table(
        index=["block_id", "date"], columns="variable", values="value"
    ).reset_index()
    wide_df = wide_df.sort_values(["block_id", "date"])
    wide_df.to_csv(OUTPUT_WIDE_CSV, index=False)
    print(f"Wrote {OUTPUT_WIDE_CSV} ({len(wide_df)} rows)")
    return wide_df


# ---------------------------------------------------------------------------
# STEP 4 — Water-balance depletion per block
# ---------------------------------------------------------------------------
def compute_depletion(wide_df):
    """
    For each block, walk through days in order:
      - add today's ETa to the running depletion
      - if depletion crosses the stress threshold, flag "irrigate" and assume
        the grower acts on it, resetting the depletion
      - otherwise flag "review" or "hold" based on the review threshold

    Note: resetting depletion on every "irrigate" flag is a modelling
    assumption, since we don't have actual irrigation event records to
    confirm real refill timing. State this plainly in the memo's
    limitations section rather than presenting it as ground truth.
    """
    results = []
    for block_id, group in wide_df.groupby("block_id"):
        group = group.sort_values("date")
        depletion = 0.0
        for _, row in group.iterrows():
            eta = row.get("ETa")
            if pd.isna(eta):
                continue  # no data this day — skip rather than guess a value

            depletion += eta

            if depletion >= STRESS_THRESHOLD_MM:
                status = "irrigate"
                depletion = REFILL_LEVEL_MM
            elif depletion >= REVIEW_THRESHOLD_MM:
                status = "review"
            else:
                status = "hold"

            results.append({
                "block_id": block_id,
                "date": row["date"],
                "ETa": eta,
                "depletion_mm": depletion,
                "status": status,
            })

    depletion_df = pd.DataFrame(results)
    depletion_df.to_csv(OUTPUT_DEPLETION_CSV, index=False)
    print(f"Wrote {OUTPUT_DEPLETION_CSV} ({len(depletion_df)} rows)")
    return depletion_df


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    os.makedirs("outputs", exist_ok=True)

    blocks = load_blocks()
    sample_raster = sorted(glob.glob(os.path.join(RASTER_FOLDERS["ETo"], "*.tif")))[0]
    blocks = match_crs(blocks, sample_raster)

    wide_df = build_zonal_stats_table(blocks)
    depletion_df = compute_depletion(wide_df)

    n_irrigate = (depletion_df["status"] == "irrigate").sum()
    n_review = (depletion_df["status"] == "review").sum()
    print(f"Done. {len(depletion_df)} block-day rows "
          f"({n_irrigate} irrigate flags, {n_review} review flags).")


if __name__ == "__main__":
    main()
