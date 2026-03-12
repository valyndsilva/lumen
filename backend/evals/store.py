import aiosqlite
import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "../../lumen_evals.db")

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                topic TEXT,
                created_at TEXT,
                draft TEXT,
                quality REAL,
                relevance REAL,
                groundedness REAL,
                latency_ms INTEGER,
                total_tokens INTEGER,
                estimated_cost_usd REAL,
                node_timings TEXT,
                token_counts TEXT
            )
        """)
        await db.commit()

async def save_run(run_id: str, topic: str, draft: str, scores: dict,
                   node_timings: dict, token_counts: dict):
    total_tokens = sum(
        v.get("input", 0) + v.get("output", 0)
        for v in token_counts.values()
    )
    total_latency = sum(node_timings.values())
    # Rough cost estimate: claude-sonnet ~$3/M input, $15/M output
    input_tokens = sum(v.get("input", 0) for v in token_counts.values())
    output_tokens = sum(v.get("output", 0) for v in token_counts.values())
    cost = (input_tokens / 1_000_000 * 3) + (output_tokens / 1_000_000 * 15)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            run_id, topic, datetime.now(timezone.utc).isoformat(), draft,
            scores.get("quality"), scores.get("relevance"), scores.get("groundedness"),
            total_latency, total_tokens, round(cost, 6),
            json.dumps(node_timings), json.dumps(token_counts),
        ))
        await db.commit()

async def get_all_runs() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM runs ORDER BY created_at DESC LIMIT 50"
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]
