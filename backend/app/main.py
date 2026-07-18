import json
import os
from datetime import date as date_type
from pathlib import Path

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
# "gemini-2.5-flash" has been retired for new API keys as of this writing;
# "-latest" is a Google-maintained alias that always resolves to a current
# flash-tier model, avoiding the same problem recurring.
GEMINI_MODEL = "gemini-flash-latest"

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


class ChatRequest(BaseModel):
    message: str
    date: str


class ChatResponse(BaseModel):
    reply: str


def build_daily_summary(date_str: str, day_rows: list[dict]) -> str:
    counts = {"irrigate": 0, "review": 0, "hold": 0}
    for row in day_rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1

    lines = [
        f"Block status summary for {date_str}:",
        f"Total blocks: {len(day_rows)} — irrigate: {counts['irrigate']}, "
        f"review: {counts['review']}, hold: {counts['hold']}",
        "",
        "Per-block detail (block_id, cultivar, status, depletion_mm):",
    ]
    for row in sorted(day_rows, key=lambda r: r["block_id"]):
        lines.append(
            f"- {row['block_id']} ({row['cultivar']}): {row['status']}, "
            f"depletion={row['depletion_mm']:.1f}mm"
        )
    return "\n".join(lines)


def build_system_prompt(date_str: str, day_rows: list[dict]) -> str:
    summary = build_daily_summary(date_str, day_rows)
    return (
        "You are the assistant for Tokara Vineyard Watch, a vineyard irrigation "
        "decision-support tool. You must answer only using the vineyard block "
        f"data provided below for {date_str}. Do not answer questions unrelated "
        "to this vineyard's irrigation status, and do not speculate or invent "
        "information beyond what is given. If asked something outside this "
        "scope, politely explain that you can only help with questions about "
        "today's vineyard block status.\n\n"
        f"{summary}"
    )


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server")

    daily = load_json("daily_status.json")
    day_rows = [row for row in daily if row["date"] == request.date]
    if not day_rows:
        raise HTTPException(status_code=404, detail=f"No block data found for date '{request.date}'")

    system_prompt = build_system_prompt(request.date, day_rows)

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(GEMINI_MODEL, system_instruction=system_prompt)
        response = model.generate_content(request.message)
        reply_text = response.text
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Chat request failed: {exc}") from exc

    return ChatResponse(reply=reply_text)
