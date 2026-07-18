# Tokara Vineyard Watch

> Daily irrigation decision-support dashboard for Tokara Estate, Stellenbosch.
> Built on **FAO-56 evapotranspiration modelling**, **Sentinel-2 remote sensing**, and **recorded vineyard phenology**.
> Developed for the **TerraClim ET-GEO Hackathon 2026**.

---

### Team Name: TerraBytes

**Team Members:**
- Daniel Riffel — phenology cross-validation logic, stage-aware thresholds, data-quality analysis
- Amy Felix — data pipeline, backend API, frontend build

---

## Overview

Tokara Vineyard Watch is a decision-support dashboard built for the TerraClim ET-GEO Hackathon by TerraBytes. It turns raw evapotranspiration rasters, satellite vegetation data, and field-recorded vineyard phenology into a single daily triage view: which blocks need water today, why, and how confident the recommendation is.

The problem it addresses: irrigation decisions on a working wine estate depend on combining several imperfect signals — weather-driven water demand, satellite-derived canopy health, and a farm's own historical growth-stage records, none of which, on their own, tells a farmer what to do this morning. Tokara Vineyard Watch fuses these into a per-block Irrigate / Review / Hold recommendation, explains the reasoning in plain language, and cross-checks the satellite signal against the farm's own recorded phenology so the farmer knows how much to trust it.

The dashboard is built mobile-first, styled to match how a farmer might actually check it before heading out into the vineyard, and includes a sign-up flow for a second farm to demonstrate how the same approach generalises beyond a single estate.

---

## Problem Statement

Wine grape irrigation decisions are typically made from a mix of instinct, spot-checks, and whatever weather data is closest to hand. Meanwhile, satellite-derived evapotranspiration and vegetation data exist for most commercial vineyards today, but usually sit in raw GeoTIFF form — genuinely useful, but not something a farm manager can act on over morning coffee.

At the same time, satellite signals aren't infallible: cloud cover, revisit gaps (Sentinel-2 only passes over Tokara roughly every 8–10 days), and modelling assumptions all introduce uncertainty. A tool that presents a satellite-derived recommendation with false confidence — with no way to check it against what's actually happening on the ground — risks being ignored or, worse, trusted when it shouldn't be.

Tokara Vineyard Watch addresses both problems: it does the fusion work (ETo → Kc → ETa → running water-balance depletion) so the farmer doesn't have to, and it cross-validates that fused signal against the farm's own recorded growth-stage history, surfacing a trust label rather than a bare number.

---

## Our Solution

| Feature | Description |
|---|---|
| **Daily Farm Status Report** | An auto-generated, plain-language summary of overall estate health and the most urgent actions, computed from the day's block-level data — not a static template |
| **Priority-Filtered Block Triage** | Irrigate / Review / Hold blocks, filterable from clickable summary counts, sorted by water deficit so the most urgent blocks surface first |
| **Trust-Scored Recommendations** | Each block's recommendation states *why*, and whether the satellite-implied growth stage agrees, disagrees, or can't be confirmed against Tokara's own recorded phenology dates |
| **Interactive Block Map** | All 70 vineyard block polygons, colour-coded by status, toggleable by NDVI / ETo / ETa / water-deficit layer |
| **Cultivar Search** | Type-ahead search that highlights matching blocks on the map by grape variety |
| **Block Detail View** | Season-long ETa vs ETo trend chart and phenology note for any individual block |
| **Sign-up Flow** | Demonstrates how the same tool would onboard a second farm, showing the concept's extensibility beyond Tokara |

The farmer opens the dashboard once each morning. The Farm Status Report tells them, in plain language, what needs attention and why. The block list lets them drill into anything specific; the map lets them see it spatially; the search lets them check a particular variety at a glance.

---

## How It Works

Every recommendation follows the same pipeline:

1. **Reference evapotranspiration (ETo)** is computed daily for the whole site from weather data alone — available every day of the season, independent of satellite imagery.
2. **Crop coefficient (Kc)** and **NDVI** are derived from Sentinel-2 imagery on satellite pass dates only (roughly 31–36 per season) — not daily.
3. **Actual evapotranspiration (ETa)** is supplied pre-computed as ETa = Kc × ETo, filled in for every day of the season from the first satellite pass onward.
4. A **running water-balance depletion** is tracked per block, per season, accumulating daily ETa until it crosses a stage-specific threshold, at which point the block is flagged **Irrigate**, **Review**, or left at **Hold**.
5. **Growth stage** is independently inferred two ways: from the farm's own recorded phenology dates (ground truth, with real gaps where a stage was never recorded), and from the shape of the Kc/NDVI trend itself (what the satellite data alone implies). These two are compared to produce a trust label: **agrees**, **disagrees**, or **stage-record-incomplete**.
6. The result is rendered as a plain-language recommendation, a status badge, and a trust badge — not a raw table of numbers.

---

## Tech Stack

### Frontend

* React + TypeScript
* Vite
* React Router
* react-leaflet (map)
* Recharts (block detail trend chart)
* Plain CSS (mobile-first, custom theme)

### Backend

* Python
* FastAPI
* Uvicorn
* Pydantic

### Data Pipeline

* geopandas
* rasterio
* rasterstats
* pandas

### Standards / Methodology

* FAO-56 crop evapotranspiration framework (ETo × Kc = ETa)
* Sentinel-2 Level-2 vegetation indices (NDVI)

---

## Data Sources

All data used is from the **Tokara Vineyard Datapack**, supplied directly by TerraClim for this hackathon: Sentinel-2 imagery tiles, daily ETo, satellite-date Kc and NDVI, daily gap-filled ETa, the 70-block vineyard shapefile (Tokara Estate, Stellenbosch), and Tokara's own recorded phenology growth-stage dates across three seasons (2022/23–2024/25).

**No external datasets were used.** FruitLook/WaPOR-style external validation products were considered (permitted under the hackathon's additional-data guidance) but deliberately not used, in favour of cross-validating against the farm's own recorded phenology data instead — this avoids external licensing/attribution complexity and keeps every number in this tool traceable to the original datapack.

---

## Repository Structure

```text
2026-terraclim-tokara/
├── README.md
├── requirements.txt
├── .gitignore
│
├── backend/                       # FastAPI app
│   ├── app/
│   │   ├── __init__.py
│   │   └── main.py                # /blocks, /status, /block/{id}/history
│   ├── data/                      # real Tokara dataset (57 blocks)
│   │   ├── blocks.geojson
│   │   ├── daily_status.json
│   │   └── phenology_stage.json
│   └── requirements.txt
│
├──frontend/
|   ├── public/
|   ├── src/
│   |   ├── assets/
│   │   ├── hero.png
│   │   ├── react.svg
│   │   └── vite.svg
│   ├── components/
│   │   ├── AuthShell.css
│   │   ├── AuthShell.tsx
│   │   ├── DemoLayout.tsx
│   │   ├── GrapeIcon.tsx
│   │   ├── PhoneFrame.css
│   │   ├── PhoneFrame.tsx
│   │   ├── VineyardMap.css
│   │   └── VineyardMap.tsx
│   ├── hooks/
│   │   └── useRoutePrefix.ts
│   ├── lib/
│   │   └── farmReport.ts
│   ├── pages/
│   │   ├── Block.css
│   │   ├── Block.tsx
│   │   ├── Dashboard.css
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   └── Signup.tsx
│   ├── App.css
│   ├── App.tsx
│   ├── api.ts
│   ├── constants.ts
│   ├── index.css
│   ├── main.tsx
│   └── theme.css
├── .gitignore
├── .oxlintrc.json
├── README.md
├── index.html
├── package-lock.json
├── package.json
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
│
├── scripts/                       
│   ├── requirements.txt
│   ├── zonal_stats_and_depletion.py
│   ├── phenology_validation.py
│   ├── build_real_data.py         
│   ├── fix_season_format.py
│   └── rerun_stage_validation.py
│
├── pipeline_raw/
│   ├── Tokara_Pheno_Data.xlsx
│   ├── block_depletion.csv
│   ├── phenology_stage_windows.csv        
│   ├── zonal_stats_long.csv
│   └── zonal_stats_wide.csv         
└── outputPH/
│   ├── phenology_stage_windows.csv
|   └── phenology_validation.csv


```

---

## Prerequisites

* Node.js 20+
* Python 3.12 (3.13/3.14 are not yet reliably supported by the geospatial stack used in `scripts/`)
* pip

---

## Installation

### 1. Clone the repository

```powershell
git clone https://github.com/YOUR_USERNAME/2026-terraclim-tokara.git
cd 2026-terraclim-tokara
```

### 2. Set up the backend

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3. Set up the frontend

```powershell
cd ../frontend
npm install
```

### 4. (Optional) Set up the data pipeline

Only needed if you're regenerating `backend/data/*` from the raw datapack rather than using the files already committed:

```powershell
cd ../scripts
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

## Running the Application

Open two terminals.

### Terminal 1 — Backend

```powershell
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Expected output:

```text
Uvicorn running on http://127.0.0.1:8000
```

### Terminal 2 — Frontend

```powershell
cd frontend
npm run dev
```

Expected output:

```text
Local:  http://localhost:5173/
```

Open:

```text
http://localhost:5173/
```

You'll land directly on the phone-framed login screen.

---

## Demo Flow

### 1. Sign In

The login screen accepts any input — no real authentication is implemented, since this is a prototype demonstrating the decision-support logic, not a production auth system. Enter any email/password and select **Sign In**.

### 2. View the Farm Status Report

Land on the dashboard. The banner greets the farmer with today's date and a plain-language summary of overall estate health, generated live from the day's block data — not a hardcoded string.

### 3. Filter by Status

Click the **Irrigate**, **Review**, or **Hold** count card to expand that tier's block list, sorted by water deficit (most urgent first). Each block shows its key indicators in plain language, a recommended action, and why — including whether the satellite-implied growth stage agrees with Tokara's own recorded phenology for that block.

### 4. Explore the Map

Scroll to the interactive map. Toggle between NDVI / ETo / ETa / Water Status to recolour all 70 blocks by that layer. Blocks are colour-coded by irrigation status by default.

### 5. Search by Cultivar

Use the search bar above the map to type a grape variety (e.g. "Chenin Blanc"). Matching blocks highlight on the map.

### 6. View Block Detail

Click any block on the map to open its detail page: a season-long chart of ETa vs ETo, and the specific phenology note explaining the trust label for that block.

### 7. Sign Up (extensibility demo)

From the login screen, select **Sign Up** to see the onboarding form for a second, hypothetical farm — demonstrating how the same tool would extend beyond Tokara. This is a UX demonstration only; it does not provision a real second dataset.

---

## Data Pipeline / Methodology

`scripts/zonal_stats_and_depletion.py` computes per-block, per-day zonal statistics (mean ETo/ETa/Kc/NDVI within each vineyard block polygon) from the raw Sentinel-2-derived rasters, then runs a running water-balance depletion calculation per block per season.

`scripts/phenology_validation.py` reconciles Tokara's two phenology record sheets into per-block, per-season stage windows, determines the recorded growth stage for any given date, independently infers a stage from the shape of the Kc/NDVI trend up to that date, and compares the two to produce the trust label used throughout the dashboard.

`scripts/build_real_data.py` merges both pipelines' outputs together with the vineyard shapefile (converted to GeoJSON) into the exact schema the backend API serves.

---

## Key Design Decisions

### Precomputed, Not Live

All raster processing happens offline, once, via the scripts in `scripts/`. The backend API only ever reads static JSON/GeoJSON files — it never imports `rasterio` or `geopandas` directly. This keeps deployment simple (no native geospatial dependencies on the API host) and the dashboard fast and reliable during a live demo.

### Trust Labels, Not Bare Confidence Scores

Rather than presenting a single opaque confidence number, every block-level recommendation states in plain language whether the satellite-derived signal agrees with the farm's own recorded phenology, disagrees, or can't be checked because the phenology record is incomplete for that block/season. Recording gaps are real and expected — the datapack's phenology records were never complete for every block and stage — and this is surfaced honestly rather than glossed over.

### No External Data Sources

FruitLook, WaPOR, and similar external ET validation products were deliberately not used, despite being permitted, in favour of cross-validating exclusively against Tokara's own recorded ground truth. Every figure in this tool traces back to the supplied datapack.

### Mock-Data-First Development

The frontend, backend API, and dashboard logic were built and fully verified against a hand-built mock dataset matching the final data contract before the real pipeline output was integrated — this let frontend and data-pipeline work proceed in parallel without either side blocking the other.

---

## AI-Tool Disclosure

Portions of this codebase were developed with AI assistance (Claude Code), used for scaffolding, implementation, and debugging under direct human direction and review at every step. All architectural decisions, data pipeline logic, and validation methodology were designed, tested, and verified by the team. The team can explain and stands behind every part of this codebase.

---

## Known Limitations

- Kc and NDVI are only available on Sentinel-2 satellite pass dates (~31–36 per season), not daily — the dashboard falls back to the most recent available reading where needed, clearly labelled with its actual capture date.
- Phenology recording has real gaps in the source data — not every growth stage was tracked for every block and season. Coverage of the trust-label validation is uneven as a direct result, and this is stated honestly rather than treated as uniform.
- 13 of the 70 shapefile polygons represent mixed sub-parcel plantings sharing a block code with more than one cultivar; the current build associates each polygon with its own recorded cultivar rather than collapsing them.
- Authentication is a UI demonstration only; no real user accounts or multi-tenant data isolation are implemented.
- A conversational assistant for interpreting map/dashboard results was scoped but not included in this submission — see Next Steps.

---

## Built With

* [FastAPI](https://fastapi.tiangolo.com/)
* [React](https://react.dev/) + [Vite](https://vitejs.dev/)
* [react-leaflet](https://react-leaflet.js.org/)
* [Recharts](https://recharts.org/)
* [rasterio](https://rasterio.readthedocs.io/) / [geopandas](https://geopandas.org/)
* The Tokara Vineyard Datapack, supplied by TerraClim

---

<p align="center">
  <strong>Tokara Vineyard Watch</strong><br>
  TerraClim ET-GEO Hackathon 2026<br>
  Built on the Tokara Vineyard Datapack
</p>
