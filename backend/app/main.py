import json
from datetime import date as date_type
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

app = FastAPI(title="Tokara Vineyard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_json(filename: str):
    with open(DATA_DIR / filename, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/blocks")
def get_blocks():
    return load_json("blocks.geojson")


@app.get("/status")
def get_status(date: date_type = Query(...)):
    date_str = date.isoformat()
    daily = load_json("daily_status.json")
    phenology = load_json("phenology_stage.json")

    phenology_by_key = {(row["block_id"], row["date"]): row for row in phenology}

    results = []
    for row in daily:
        if row["date"] != date_str:
            continue
        match = phenology_by_key.get((row["block_id"], row["date"]), {})
        results.append({
            **row,
            "stage": match.get("stage"),
            "phenology_note": match.get("phenology_note"),
        })
    return results


@app.get("/block/{block_id}/history")
def get_block_history(block_id: str):
    daily = load_json("daily_status.json")
    history = [row for row in daily if row["block_id"] == block_id]
    if not history:
        raise HTTPException(status_code=404, detail=f"No history found for block_id '{block_id}'")
    return sorted(history, key=lambda row: row["date"])
