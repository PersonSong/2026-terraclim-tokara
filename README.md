# 2026-terraclim-tokara

## Backend (FastAPI)

Requirements check — `backend/requirements.txt` must contain (and only contain) the
API's own dependencies: `fastapi`, `uvicorn`, `pydantic`, `python-dotenv`. The
geospatial stack (`geopandas`, `rasterio`, `rasterstats`, `pandas`) belongs in
`scripts/requirements.txt` instead — the API must never import `rasterio` or
`geopandas`.

Install and run:

```
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --app-dir backend
```

The app serves mock data from `backend/data/` (`blocks.geojson`, `daily_status.json`,
`phenology_stage.json`) via `GET /blocks`, `GET /status?date=YYYY-MM-DD`, and
`GET /block/{block_id}/history`. CORS is open to `http://localhost:5173` for the
Vite frontend.