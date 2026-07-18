"""
Phenology cross-validation — ET-GEO Hackathon (Tokara)

Built against Tokara_Pheno_Data.xlsx, which has two sheets:
  - Tokara_FAO56_Growth_Stages: one confirmed date per stage per block/season
    (Budbreak, Flowering, PreVeraison, Harvest, Leafdrop — later stages have
    a lot of missing values, especially Harvest and Leafdrop)
  - Tokara_Growth_Stages: 5th/50th/95th-percentile date RANGES for Budbreak,
    Flowering, and Veraison per block/season — this is what lets us produce
    a "±N days" style confidence rather than a single hard date

STEP 1  Load both sheets and reconcile them into one stage-window table,
        keyed by block_id + season (confirmed as the natural unique key —
        54 unique blocks x 3 seasons = 162 rows, matching both sheets)
STEP 2  Given a block/season/date, determine the recorded stage + whether
        the record is complete enough to trust
STEP 3  Independently infer a stage from the shape of the Kc or NDVI curve,
        using only data up to and including the day in question (no
        phenology data needed — this is the "what the satellite data
        alone suggests, as of that day" side of the comparison)
STEP 4  Compare the two and produce the three-way trust label:
        "agrees" / "disagrees" / "stage-record-incomplete"
STEP 5  Stage-aware depletion: same running water-balance calculation as
        before, but thresholds now vary by growth stage instead of being
        one fixed number for the whole season

Run standalone to produce outputs/phenology_stage_windows.csv for review.
To integrate with the zonal stats pipeline, call compute_stage_aware_depletion()
with the wide-format DataFrame produced by zonal_stats_and_depletion.py.

FIXED (see inline comments marked "FIX:"):
  - infer_stage_from_trend was being called with the *entire* season's data
    every time, regardless of which date was being evaluated — meaning every
    day in a season got the exact same "implied stage" (whatever the last
    few rows of the whole season looked like). It's now called with only the
    rows up to and including the current date, so the implied stage — and
    therefore the trust label — genuinely varies day by day, which is the
    entire point of a daily trust badge.
"""

import os

import pandas as pd

PROJECT_ROOT = "/workspaces/2026-terraclim-tokara/2026-terraclim-tokara"
PHENO_PATH = os.path.join(PROJECT_ROOT, "data", "Hackathon", "Tokara_Pheno_Data.xlsx")
OUTPUT_STAGE_WINDOWS_CSV = "outputPH/phenology_stage_windows.csv"
OUTPUT_VALIDATION_CSV = "outputPH/phenology_validation.csv"

STAGE_ORDER = [
    "dormant", "budbreak_flowering", "flowering_preveraison",
    "post_veraison", "post_harvest",
]

# Starting point only — confirm and refine these with your lecturer.
# Wine grapes are often deliberately given mild deficit irrigation
# pre-veraison and post-veraison for quality management (regulated deficit
# irrigation), so these numbers should not be treated as validated —
# they're a reasonable first guess to demo the stage-aware logic.
STAGE_THRESHOLDS_MM = {
    "dormant":                {"review": 40.0, "stress": 60.0},
    "budbreak_flowering":     {"review": 15.0, "stress": 25.0},
    "flowering_preveraison":  {"review": 12.0, "stress": 20.0},  # flowering/fruit-set is water-sensitive
    "post_veraison":          {"review": 18.0, "stress": 30.0},  # some deficit-irrigation tolerance
    "post_harvest":           {"review": 35.0, "stress": 50.0},
}


# ---------------------------------------------------------------------------
# STEP 1 — Load and reconcile both phenology sheets into one stage-window table
# ---------------------------------------------------------------------------
def load_stage_windows(path=PHENO_PATH):
    fao56 = pd.read_excel(path, sheet_name="Tokara_FAO56_Growth_Stages")
    growth = pd.read_excel(path, sheet_name="Tokara_Growth_Stages")

    fao56 = fao56.rename(columns={"Block ID": "block_id"})
    growth = growth.rename(columns={"Block ID": "block_id"})

    merged = pd.merge(
        fao56[["block_id", "Cultivar", "season", "Budbreak", "Flowering", "PreVeraison", "Harvest"]],
        growth[["block_id", "season", "BB (5%)", "BB (95%)", "FL (5%)", "FL (95%)", "V (5%)", "V (95%)"]],
        on=["block_id", "season"],
        how="outer",
    )

    # Prefer the percentile window where available; fall back to the single
    # FAO56 confirmed date (a zero-width window) otherwise.
    merged["budbreak_start"] = merged["BB (5%)"].fillna(merged["Budbreak"])
    merged["budbreak_end"] = merged["BB (95%)"].fillna(merged["Budbreak"])
    merged["flowering_start"] = merged["FL (5%)"].fillna(merged["Flowering"])
    merged["flowering_end"] = merged["FL (95%)"].fillna(merged["Flowering"])
    merged["veraison_start"] = merged["V (5%)"].fillna(merged["PreVeraison"])
    merged["veraison_end"] = merged["V (95%)"].fillna(merged["PreVeraison"])
    merged["harvest_date"] = merged["Harvest"]

    keep_cols = [
        "block_id", "Cultivar", "season",
        "budbreak_start", "budbreak_end",
        "flowering_start", "flowering_end",
        "veraison_start", "veraison_end",
        "harvest_date",
    ]
    return merged[keep_cols].copy()


# ---------------------------------------------------------------------------
# STEP 2 — Determine the recorded stage (+ confidence) for a given date
# ---------------------------------------------------------------------------
def get_recorded_stage(stage_windows, block_id, season, date):
    """
    Returns (stage_name, confidence).
    confidence is "confirmed" if every boundary date for this block/season
    is present, or "incomplete" if one or more is missing (common — the
    datapack has real gaps, especially for Harvest).
    """
    row = stage_windows[(stage_windows["block_id"] == block_id) & (stage_windows["season"] == season)]
    if row.empty:
        return None, "incomplete"
    row = row.iloc[0]

    boundaries = [row["budbreak_start"], row["flowering_start"], row["veraison_start"], row["harvest_date"]]
    confidence = "incomplete" if any(pd.isna(b) for b in boundaries) else "confirmed"

    if pd.notna(row["harvest_date"]) and date >= row["harvest_date"]:
        return "post_harvest", confidence
    if pd.notna(row["veraison_start"]) and date >= row["veraison_start"]:
        return "post_veraison", confidence
    if pd.notna(row["flowering_start"]) and date >= row["flowering_start"]:
        return "flowering_preveraison", confidence
    if pd.notna(row["budbreak_start"]) and date >= row["budbreak_start"]:
        return "budbreak_flowering", confidence
    return "dormant", confidence


# ---------------------------------------------------------------------------
# STEP 3 — Infer a stage from the NDVI/Kc trend (no phenology data needed)
# ---------------------------------------------------------------------------
def infer_stage_from_trend(dates, values, window=3):
    """
    Simple heuristic based on the shape of the Kc (or NDVI) curve:
      - low and flat, well below seasonal peak  -> dormant / post_harvest
      - rising quickly                          -> budbreak_flowering
      - near seasonal peak and roughly flat     -> flowering_preveraison
      - declining from peak                     -> post_veraison

    IMPORTANT: pass in only the data available up to the date you're
    evaluating — this function itself doesn't know "today", it just looks
    at the tail of whatever series it's handed. Passing a full season's
    data for every call defeats the point of a daily trust badge (see the
    fix in compute_stage_aware_depletion below).

    This is a simplification, not a validated phenology model — state this
    plainly wherever the trust badge is explained in the memo.
    """
    series = pd.Series(list(values), index=pd.to_datetime(list(dates))).sort_index().dropna()
    if len(series) < window + 1:
        return None

    recent = series.iloc[-(window + 1):]
    slope = recent.diff().mean()
    level = recent.iloc[-1]
    peak = series.max()

    if peak == 0 or pd.isna(peak):
        return None
    if level < 0.3 * peak:
        return "dormant"
    if slope > 0.02 * peak:
        return "budbreak_flowering"
    if slope < -0.02 * peak:
        return "post_veraison"
    return "flowering_preveraison"


# ---------------------------------------------------------------------------
# STEP 4 — Trust label: compare recorded vs implied stage
# ---------------------------------------------------------------------------
def trust_label(recorded_stage, implied_stage, confidence):
    if confidence == "incomplete" or recorded_stage is None or implied_stage is None:
        return "stage-record-incomplete"
    return "agrees" if recorded_stage == implied_stage else "disagrees"


# ---------------------------------------------------------------------------
# Helper — map a calendar date to the Aug-Apr growing season label
# ---------------------------------------------------------------------------
def season_from_date(date):
    """e.g. a date in Nov 2022 or Feb 2023 both map to '2022/2023'."""
    year = date.year
    if date.month >= 7:
        return f"{year}/{year + 1}"
    return f"{year - 1}/{year}"


# ---------------------------------------------------------------------------
# STEP 5 — Stage-aware depletion (replaces the fixed-threshold version)
# ---------------------------------------------------------------------------
def compute_stage_aware_depletion(wide_df, stage_windows):
    """
    wide_df: the wide-format table from zonal_stats_and_depletion.py,
    with columns including block_id, date, ETa, Kc (NDVI optional).

    Same running-depletion logic as before, but the review/stress
    thresholds — and the trust label — now vary by day, based on the
    block's recorded and/or NDVI-Kc-implied phenology stage.
    """
    results = []
    for block_id, group in wide_df.groupby("block_id"):
        group = group.sort_values("date")
        depletion = 0.0
        for _, row in group.iterrows():
            eta = row.get("ETa")
            if pd.isna(eta):
                continue

            date = row["date"]
            season = season_from_date(date)

            recorded_stage, confidence = get_recorded_stage(stage_windows, block_id, season, date)

            # FIX: only look at data up to and including "today" (this row's
            # date), not the whole season. Previously this passed the full
            # `group` every iteration, so every day got the same answer —
            # whatever the last few rows of the entire season looked like.
            causal_slice = group[group["date"] <= date]
            implied_stage = infer_stage_from_trend(causal_slice["date"], causal_slice.get("Kc"))

            trust = trust_label(recorded_stage, implied_stage, confidence)

            stage_for_threshold = recorded_stage or implied_stage or "flowering_preveraison"
            thresholds = STAGE_THRESHOLDS_MM.get(stage_for_threshold, STAGE_THRESHOLDS_MM["flowering_preveraison"])

            depletion += eta
            if depletion >= thresholds["stress"]:
                status = "irrigate"
                depletion = 0.0
            elif depletion >= thresholds["review"]:
                status = "review"
            else:
                status = "hold"

            results.append({
                "block_id": block_id,
                "date": date,
                "season": season,
                "ETa": eta,
                "depletion_mm": depletion,
                "recorded_stage": recorded_stage,
                "implied_stage": implied_stage,
                "trust_label": trust,
                "status": status,
            })

    validation_df = pd.DataFrame(results)
    validation_df.to_csv(OUTPUT_VALIDATION_CSV, index=False)
    print(f"Wrote {OUTPUT_VALIDATION_CSV} ({len(validation_df)} rows)")
    return validation_df


# ---------------------------------------------------------------------------
# MAIN — quick self-check: write out the derived stage windows for review
# ---------------------------------------------------------------------------
def main():
    os.makedirs("outputs", exist_ok=True)
    stage_windows = load_stage_windows()
    stage_windows.to_csv(OUTPUT_STAGE_WINDOWS_CSV, index=False)
    print(f"Wrote {OUTPUT_STAGE_WINDOWS_CSV} ({len(stage_windows)} block/season rows)")

    n_incomplete = stage_windows[
        ["budbreak_start", "flowering_start", "veraison_start", "harvest_date"]
    ].isna().any(axis=1).sum()
    print(f"{n_incomplete} of {len(stage_windows)} block/season records have at least one missing stage date")
    print("(This is expected — Harvest and Leafdrop have real gaps in the source data. "
          "State this coverage gap plainly in the memo rather than treating every block as equally validated.)")


if __name__ == "__main__":
    main()
