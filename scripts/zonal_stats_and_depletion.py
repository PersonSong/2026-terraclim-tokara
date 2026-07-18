"""
Zonal statistics + water-balance depletion pipeline — ET-GEO Hackathon

STEP 1  Load vineyard block polygons, check/match CRS against the rasters
STEP 2  For each season and variable (ETo, ETa, Kc, NDVI), compute the
        per-block mean on every date a raster exists for it
STEP 3  Combine everything into one long table, then pivot to a wide table
        (one row per block per season per date, one column per variable)
STEP 4  Walk each block-season's daily ETa chronologically to build a
        running water-balance depletion, and flag irrigate / review / hold

Install requirements first:
    pip install geopandas rasterio rasterstats pandas

FIXED (see inline comments marked "FIX:"):
  - season labels are now written out as "YYYY/YYYY" (matching the rest of
    the app and the datapack guide's convention), even though the actual
    folder names on disk stay "YYYY_YYYY" — folder lookups are unaffected,
    only the season value stored in the output rows changed.
"""

import glob
import os
from datetime import datetime

import geopandas as gpd
import pandas as pd
from rasterstats import zonal_stats

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
PROJECT_ROOT = "/workspaces/2026-terraclim-tokara/2026-terraclim-tokara"

BLOCK_POLYGONS_PATH = os.path.join(PROJECT_ROOT, "data", "Hackathon", "Shapefiles", "Tokara_Polygons.shp")
BLOCK_ID_FIELD = "BLOCK"

# Folder names on disk — these stay underscore-separated because that's the
# actual directory structure. Don't change these to match the season label
# format; see season_folder_to_label() below for the display conversion.
SEASONS = ["2022_2023", "2023_2024", "2024_2025"]

# ETo/ETa/Kc/NDVI each have a 3m and a 10m subfolder. 10m matches the
# brief's "10 m daily ET-GEO" framing and is far lighter to process — start
# here. Switch to "3m" later only if you specifically need finer detail for
# a block small enough that 10m pixels blur its boundary, since it will be
# noticeably slower (more raster cells to read per zonal-stats call).
RESOLUTION = "10m"

VARIABLES = ["ETo", "ETa", "Kc", "NDVI"]


def get_raster_folder(season, variable, resolution=RESOLUTION):
    return os.path.join(PROJECT_ROOT, "data", "Hackathon", season, variable, resolution)


def date_from_filename(fname):
    """Matches TerraClim's pattern, e.g. 'ETa_Tokara_2022-08-28_10m.tif'."""
    stem = os.path.basename(fname).split("_")[2]
    return datetime.strptime(stem, "%Y-%m-%d")


def season_folder_to_label(season_folder):
    """
    FIX: convert an on-disk folder name like '2022_2023' into the display/
    contract format '2022/2023' used everywhere else in the app (the
    frontend, phenology_validation.py's season_from_date(), and the
    datapack guide itself). This was the source of a real mismatch between
    this script's output and the phenology validation script's output —
    they'd disagree on season format for the exact same rows, breaking any
    merge keyed on (block_id, season, date).
    """
    return season_folder.replace("_", "/")


OUTPUT_LONG_CSV = "outputs/zonal_stats_long.csv"
OUTPUT_WIDE_CSV = "outputs/zonal_stats_wide.csv"
OUTPUT_DEPLETION_CSV = "outputs/block_depletion.csv"

# Water-balance parameters — starting points only, confirm with your lecturer.
REFILL_LEVEL_MM = 0.0
STRESS_THRESHOLD_MM = 25.0
REVIEW_THRESHOLD_MM = 15.0


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
# STEP 2 — Zonal stats for one season/variable, across every date it has a raster
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
            nodata=None,
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
# STEP 3 — Loop every season x variable, combine into one long table, pivot wide
# ---------------------------------------------------------------------------
def build_zonal_stats_table(blocks):
    all_rows = []
    for season_folder in SEASONS:
        season_label = season_folder_to_label(season_folder)  # FIX: e.g. "2022/2023"
        for variable_name in VARIABLES:
            folder = get_raster_folder(season_folder, variable_name)
            if not os.path.isdir(folder):
                print(f"Skipping {season_folder}/{variable_name} — folder not found: {folder}")
                continue

            print(f"Processing {season_folder} / {variable_name} ({RESOLUTION})...")
            rows = zonal_stats_for_variable(blocks, variable_name, folder)
            for row in rows:
                row["season"] = season_label  # FIX: store the slash-format label, not the folder name
            all_rows.extend(rows)

    long_df = pd.DataFrame(all_rows)
    long_df.to_csv(OUTPUT_LONG_CSV, index=False)
    print(f"Wrote {OUTPUT_LONG_CSV} ({len(long_df)} rows)")
    print("Debug - long_df columns are:", long_df.columns.tolist())

    wide_df = long_df.pivot_table(
        index=["block_id", "season", "date"], columns="variable", values="value"
    ).reset_index()
    wide_df = wide_df.sort_values(["block_id", "season", "date"])
    wide_df.to_csv(OUTPUT_WIDE_CSV, index=False)
    print(f"Wrote {OUTPUT_WIDE_CSV} ({len(wide_df)} rows)")
    print("Debug - wide_df columns are:", wide_df.columns.tolist())
    return wide_df


# ---------------------------------------------------------------------------
# STEP 4 — Water-balance depletion per block, per season
# ---------------------------------------------------------------------------
def compute_depletion(wide_df):
    """
    Groups by (block_id, season) rather than block_id alone — a vine's
    water deficit shouldn't carry over from one season's harvest into the
    next season's budbreak after a dormancy break, so each season starts
    its own depletion count from zero.
    """
    results = []
    for (block_id, season), group in wide_df.groupby(["block_id", "season"]):
        group = group.sort_values("date")
        depletion = 0.0
        for _, row in group.iterrows():
            eta = row.get("ETa")
            if pd.isna(eta):
                continue

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
                "season": season,
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

    # Find a sample raster from whichever season's ETo folder exists first,
    # just to read its CRS for reprojecting the block polygons.
    sample_raster = None
    for season_folder in SEASONS:
        candidate_folder = get_raster_folder(season_folder, "ETo")
        candidates = sorted(glob.glob(os.path.join(candidate_folder, "*.tif")))
        if candidates:
            sample_raster = candidates[0]
            break

    if sample_raster is None:
        raise FileNotFoundError(
            "No .tif files found in any season's ETo folder.\n"
            "Please verify your PROJECT_ROOT and RESOLUTION configuration match the folder structure."
        )

    blocks = match_crs(blocks, sample_raster)

    wide_df = build_zonal_stats_table(blocks)
    depletion_df = compute_depletion(wide_df)

    n_irrigate = (depletion_df["status"] == "irrigate").sum()
    n_review = (depletion_df["status"] == "review").sum()
    print(f"Done. {len(depletion_df)} block-season-day rows "
          f"({n_irrigate} irrigate flags, {n_review} review flags).")


if __name__ == "__main__":
    main()
