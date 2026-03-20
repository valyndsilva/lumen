import asyncio
import json
import uuid

from agent.graph import lumen_graph
from agent.nodes import MAX_REFLECTION_ITERATIONS
from auth.keys import get_user_key_async
from evals.judge import score_draft_async
from evals.store import save_run
from redis_services import (
    store_run_state,
    get_run_state,
    is_cancelled,
    clear_cancelled,
)


def _sse(event: str, data: dict) -> str:
    """Format a server-sent event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _strip_secrets(state: dict) -> dict:
    """Remove BYOK keys before persisting state."""
    return {k: v for k, v in state.items() if not k.startswith("_byok_")}


def _build_node_event(
    node_name: str,
    node_output: dict,
    state: dict,
    pre_iteration: int | None = None,
) -> dict:
    """Build the SSE event payload for a node_complete event."""
    iteration = pre_iteration if pre_iteration is not None else state.get("iteration", 0)
    event_data = {
        "node": node_name,
        "timing_ms": node_output.get("node_timings", {}).get(node_name),
        "iteration": iteration,
    }

    if node_name == "planner":
        queries = state.get("search_queries", [])
        event_data["meta"] = {"queries": len(queries), "preview": queries}
    elif node_name == "searcher":
        new_results = node_output.get("search_results", [])
        event_data["meta"] = {
            "sources": len(new_results),
            "preview": [{"title": r["title"], "url": r["url"]} for r in new_results[:6]],
        }
    elif node_name == "summariser":
        new_summaries = node_output.get("summaries", [])
        event_data["meta"] = {"summaries": len(new_summaries)}
    elif node_name == "outliner":
        outline = state.get("outline", "")
        event_data["meta"] = {
            "sections": outline.count("## ") if outline else 0,
            "preview": outline[:500] if outline else "",
        }
    elif node_name == "drafter":
        draft = state.get("draft", "")
        event_data["meta"] = {"words": len(draft.split()) if draft else 0}
    elif node_name == "reflection":
        event_data["reflection_action"] = state.get("reflection_action", "accept")
        event_data["critique"] = state.get("reflection", "")

    return event_data


async def _resolve_byok(state: dict, user_id: str, byok_keys: dict | None) -> None:
    """Apply BYOK keys to state in-place — from request or saved key."""
    if byok_keys:
        state.update(byok_keys)
        print(f"[BYOK] Using request key for user {user_id[:10]}...")
    else:
        saved = await get_user_key_async(user_id)
        if saved:
            state["_byok_anthropic_key"] = saved["key"]
            print(f"[BYOK] Loaded saved key for user {user_id[:10]}..., length={len(saved['key'])}")
        else:
            print(f"[BYOK] WARNING: No key found for user {user_id[:10]}...")


async def _stream_pipeline(state: dict, run_id: str, user_id: str):
    """Core streaming loop shared by research and refine."""
    yield _sse("start", {"run_id": run_id, "topic": state["topic"], "domain": state.get("domain", "general")})

    try:
        cancelled = False
        async for chunk in lumen_graph.astream(state, stream_mode="updates"):
            if is_cancelled(run_id):
                clear_cancelled(run_id)
                cancelled = True
                yield _sse("cancelled", {"run_id": run_id})
                break
            for node_name, node_output in chunk.items():
                if not node_output:
                    continue
                pre_iteration = state.get("iteration", 0)
                state.update(node_output)
                yield _sse("node_complete", _build_node_event(node_name, node_output, state, pre_iteration))
                await asyncio.sleep(0)

        if cancelled:
            return

        yield _sse("eval_start", {})
        sources = [r["url"] for r in state.get("search_results", [])]
        byok_key = state.get("_byok_anthropic_key")
        scores = await score_draft_async(state["topic"], state.get("draft", ""), sources, api_key=byok_key)
        await save_run(
            run_id, user_id, state["topic"], state.get("draft", ""), sources,
            scores, state.get("node_timings", {}), state.get("token_counts", {}),
        )
        store_run_state(run_id, _strip_secrets(state))

        yield _sse("complete", {
            "draft": state.get("draft", ""),
            "sources": sources,
            "scores": scores,
            "node_timings": state.get("node_timings", {}),
            "token_counts": state.get("token_counts", {}),
            "run_id": run_id,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        yield _sse("error", {"code": _classify_error(e), "detail": str(e)})


def _classify_error(e: Exception) -> str:
    """Classify an exception into a user-facing error code."""
    msg = str(e).lower()
    err_type = type(e).__name__.lower()

    # Anthropic / LLM errors
    if any(k in msg for k in ("anthropic", "claude", "overloaded", "rate_limit")) or \
       any(k in err_type for k in ("anthropic", "api")):
        return "llm"

    # Search provider errors
    if any(k in msg for k in ("tavily", "pubmed", "courtlistener", "edgar", "search")) or \
       any(k in err_type for k in ("httpx", "connection", "timeout")):
        return "search_provider"

    # Auth / key errors
    if any(k in msg for k in ("authentication", "unauthorized", "token", "jwt", "clerk")):
        return "auth"

    # Database errors
    if any(k in msg for k in ("supabase", "postgres", "database")):
        return "database"

    return "unknown"


async def stream_research(
    topic: str,
    user_id: str,
    domain: str = "general",
    byok_keys: dict | None = None,
):
    """Stream a new research pipeline run."""
    run_id = str(uuid.uuid4())
    state = {
        "topic": topic,
        "domain": domain,
        "search_queries": [],
        "search_results": [],
        "summarised_urls": [],
        "summaries": [],
        "outline": "",
        "draft": "",
        "reflection": "",
        "reflections": [],
        "reflection_action": "accept",
        "should_continue": False,
        "iteration": 0,
        "node_timings": {},
        "token_counts": {},
        "eval_scores": None,
        "run_id": run_id,
    }
    await _resolve_byok(state, user_id, byok_keys)
    async for chunk in _stream_pipeline(state, run_id, user_id):
        yield chunk


async def stream_refine(
    run_id: str,
    user_id: str,
    byok_keys: dict | None = None,
):
    """Stream one additional iteration on an existing research run."""
    state = get_run_state(run_id)
    if not state:
        yield _sse("error", {"detail": "Run not found or expired"})
        return

    state["should_continue"] = False
    state["iteration"] = MAX_REFLECTION_ITERATIONS  # Forces reflection to accept immediately — single pass
    await _resolve_byok(state, user_id, byok_keys)
    async for chunk in _stream_pipeline(state, run_id, user_id):
        yield chunk
