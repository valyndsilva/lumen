import os
from datetime import datetime, timezone
from supabase import create_client

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = create_client(
            os.environ.get("SUPABASE_URL", ""),
            os.environ.get("SUPABASE_KEY", ""),
        )
    return _client


async def init_db():
    """No-op — Supabase table is created via SQL editor."""
    pass


async def save_run(run_id: str, user_id: str, topic: str, draft: str,
                   sources: list[str], scores: dict,
                   node_timings: dict, token_counts: dict):
    total_tokens = sum(
        v.get("input", 0) + v.get("output", 0)
        for v in token_counts.values()
    )
    total_latency = sum(node_timings.values())
    input_tokens = sum(v.get("input", 0) for v in token_counts.values())
    output_tokens = sum(v.get("output", 0) for v in token_counts.values())
    cost = (input_tokens / 1_000_000 * 3) + (output_tokens / 1_000_000 * 15)

    row = {
        "id": run_id,
        "user_id": user_id,
        "topic": topic,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "draft": draft,
        "sources": sources,
        "quality": scores.get("quality"),
        "relevance": scores.get("relevance"),
        "groundedness": scores.get("groundedness"),
        "latency_ms": total_latency,
        "total_tokens": total_tokens,
        "estimated_cost_usd": round(cost, 6),
        "node_timings": node_timings,
        "token_counts": token_counts,
    }

    _get_client().table("runs").upsert(row).execute()


async def get_all_runs(user_id: str) -> list[dict]:
    result = (_get_client()
              .table("runs")
              .select("id, user_id, topic, created_at, quality, relevance, groundedness, latency_ms, total_tokens, estimated_cost_usd, node_timings, token_counts")
              .eq("user_id", user_id)
              .order("created_at", desc=True)
              .limit(50)
              .execute())
    return result.data


async def get_run(run_id: str, user_id: str) -> dict | None:
    result = (_get_client()
              .table("runs")
              .select("*")
              .eq("id", run_id)
              .eq("user_id", user_id)
              .limit(1)
              .execute())
    return result.data[0] if result.data else None
