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
                sources TEXT,
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
        # Migrate: add sources column if missing (existing DBs)
        try:
            await db.execute("ALTER TABLE runs ADD COLUMN sources TEXT DEFAULT '[]'")
        except Exception:
            pass  # column already exists
        await db.commit()

async def save_run(run_id: str, topic: str, draft: str, sources: list[str],
                   scores: dict, node_timings: dict, token_counts: dict):
    total_tokens = sum(
        v.get("input", 0) + v.get("output", 0)
        for v in token_counts.values()
    )
    total_latency = sum(node_timings.values())
    input_tokens = sum(v.get("input", 0) for v in token_counts.values())
    output_tokens = sum(v.get("output", 0) for v in token_counts.values())
    cost = (input_tokens / 1_000_000 * 3) + (output_tokens / 1_000_000 * 15)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO runs
            (id, topic, created_at, draft, sources, quality, relevance, groundedness,
             latency_ms, total_tokens, estimated_cost_usd, node_timings, token_counts)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            run_id, topic, datetime.now(timezone.utc).isoformat(), draft,
            json.dumps(sources),
            scores.get("quality"), scores.get("relevance"), scores.get("groundedness"),
            total_latency, total_tokens, round(cost, 6),
            json.dumps(node_timings), json.dumps(token_counts),
        ))
        await db.commit()

async def get_all_runs() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, topic, created_at, quality, relevance, groundedness, "
            "latency_ms, total_tokens, estimated_cost_usd, node_timings, token_counts "
            "FROM runs ORDER BY created_at DESC LIMIT 50"
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_run(run_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM runs WHERE id = ?", (run_id,)
        ) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else None
