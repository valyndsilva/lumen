import json
import os
import uuid
import asyncio
import time
import re
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from agent.graph import lumen_graph
from evals.judge import score_draft
from evals.store import init_db, save_run, get_all_runs, get_run
from domains import list_domains

# In-memory store for run states (enables refine/dig-deeper)
# Evicts entries older than 1 hour to prevent unbounded growth
_run_states: dict[str, dict] = {}
_run_timestamps: dict[str, float] = {}
RUN_STATE_TTL = 3600  # 1 hour


def _store_run_state(run_id: str, state: dict):
    """Store run state with timestamp, evicting expired entries."""
    now = time.time()
    # Evict expired entries
    expired = [k for k, t in _run_timestamps.items() if now - t > RUN_STATE_TTL]
    for k in expired:
        _run_states.pop(k, None)
        _run_timestamps.pop(k, None)
    _run_states[run_id] = state
    _run_timestamps[run_id] = now


# Cancellation registry — run_ids that should stop early
# Auto-expires entries older than 5 minutes
_cancelled_runs: dict[str, float] = {}
CANCEL_TTL = 300  # 5 minutes


def _mark_cancelled(run_id: str):
    now = time.time()
    # Evict expired cancellations
    expired = [k for k, t in _cancelled_runs.items() if now - t > CANCEL_TTL]
    for k in expired:
        del _cancelled_runs[k]
    _cancelled_runs[run_id] = now


def _is_cancelled(run_id: str) -> bool:
    return run_id in _cancelled_runs


def _clear_cancelled(run_id: str):
    _cancelled_runs.pop(run_id, None)


# --- Rate limiter ---

class RateLimiter:
    """Sliding window rate limiter with multiple tiers (per-minute, per-hour, per-day)."""

    def __init__(self, tiers: list[tuple[int, int]]):
        """tiers: list of (max_requests, window_seconds)"""
        self.tiers = tiers
        self._requests: dict[str, list[float]] = {}

    def _prune(self, key: str, now: float) -> list[float]:
        max_window = max(w for _, w in self.tiers)
        timestamps = self._requests.get(key, [])
        timestamps = [t for t in timestamps if t > now - max_window]
        if timestamps:
            self._requests[key] = timestamps
        else:
            self._requests.pop(key, None)  # evict empty IPs
        return timestamps

    def check(self, key: str) -> tuple[bool, str]:
        """Returns (allowed, denial_reason). denial_reason is empty if allowed."""
        now = time.time()
        timestamps = self._prune(key, now)
        for max_req, window in self.tiers:
            cutoff = now - window
            count = sum(1 for t in timestamps if t > cutoff)
            if count >= max_req:
                if window >= 86400:
                    return False, "daily_limit"
                elif window >= 3600:
                    return False, "hourly_limit"
                else:
                    return False, "rate_limit"
        timestamps.append(now)
        self._requests[key] = timestamps
        return True, ""

    def remaining_daily(self, key: str) -> int:
        now = time.time()
        daily_tier = next(((m, w) for m, w in self.tiers if w >= 86400), None)
        if not daily_tier:
            return 999
        max_req, window = daily_tier
        timestamps = self._prune(key, now)
        count = sum(1 for t in timestamps if t > now - window)
        return max(0, max_req - count)


class ConcurrencyLimiter:
    """Limits concurrent active pipelines per IP."""

    def __init__(self, max_concurrent: int = 1):
        self.max_concurrent = max_concurrent
        self._active: dict[str, int] = {}

    def acquire(self, key: str) -> bool:
        current = self._active.get(key, 0)
        if current >= self.max_concurrent:
            return False
        self._active[key] = current + 1
        return True

    def release(self, key: str):
        current = self._active.get(key, 0)
        if current <= 1:
            self._active.pop(key, None)  # evict when done
        else:
            self._active[key] = current - 1


class GlobalCounter:
    """Global daily request counter across all IPs."""

    def __init__(self, max_daily: int):
        self.max_daily = max_daily
        self._timestamps: list[float] = []

    def check(self) -> tuple[bool, int]:
        now = time.time()
        cutoff = now - 86400
        self._timestamps = [t for t in self._timestamps if t > cutoff]
        remaining = max(0, self.max_daily - len(self._timestamps))
        if len(self._timestamps) >= self.max_daily:
            return False, remaining
        self._timestamps.append(now)
        return True, remaining


# Per-IP: 2/min, 10/hour, 20/day
research_limiter = RateLimiter(tiers=[
    (2, 60),       # 2 per minute
    (10, 3600),    # 10 per hour
    (20, 86400),   # 20 per day
])
# Per-IP: 3/min, 10/hour
refine_limiter = RateLimiter(tiers=[
    (3, 60),       # 3 per minute
    (10, 3600),    # 10 per hour
])
# Per-IP: 30/min (read-only, cheap)
evals_limiter = RateLimiter(tiers=[(30, 60)])
# Global: 100 research runs/day across all users
global_counter = GlobalCounter(max_daily=int(os.environ.get("LUMEN_DAILY_CAP", "100")))
# 1 active pipeline per IP
concurrency_limiter = ConcurrencyLimiter(max_concurrent=1)


# --- Input validation ---

TOPIC_MIN_LENGTH = 3
TOPIC_MAX_LENGTH = 500


class ResearchRequest(BaseModel):
    topic: str
    domain: str = "general"
    anthropic_api_key: str | None = None

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, v: str) -> str:
        v = v.strip()
        if len(v) < TOPIC_MIN_LENGTH:
            raise ValueError(f"Topic must be at least {TOPIC_MIN_LENGTH} characters")
        if len(v) > TOPIC_MAX_LENGTH:
            raise ValueError(f"Topic must be at most {TOPIC_MAX_LENGTH} characters")
        # Block obvious prompt injection attempts
        injection_patterns = [
            r"ignore\s+(previous|above|all)\s+(instructions|prompts)",
            r"you\s+are\s+now\s+",
            r"system\s*:\s*",
            r"<\s*/?script",
        ]
        lower = v.lower()
        for pattern in injection_patterns:
            if re.search(pattern, lower):
                raise ValueError("Invalid topic content")
        return v

    @property
    def is_byok(self) -> bool:
        return bool(self.anthropic_api_key)


class RefineRequest(BaseModel):
    anthropic_api_key: str | None = None

    @property
    def is_byok(self) -> bool:
        return bool(self.anthropic_api_key)


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# --- App ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan)

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


def _strip_secrets(state: dict) -> dict:
    """Remove BYOK keys before persisting state."""
    return {k: v for k, v in state.items() if not k.startswith("_byok_")}


def _build_node_event(node_name: str, node_output: dict, state: dict, pre_iteration: int | None = None) -> dict:
    """Build the SSE event payload for a node_complete event, including node-specific meta."""
    # Use pre_iteration (captured before state.update) so reflection doesn't
    # report the NEXT iteration's number
    iteration = pre_iteration if pre_iteration is not None else state.get("iteration", 0)
    event_data = {
        "node": node_name,
        "timing_ms": node_output.get("node_timings", {}).get(node_name),
        "iteration": iteration,
    }

    # Node-specific meta with actual counts + preview data
    if node_name == "planner":
        queries = state.get("search_queries", [])
        event_data["meta"] = {
            "queries": len(queries),
            "preview": queries,  # actual query strings
        }
    elif node_name == "searcher":
        new_results = node_output.get("search_results", [])
        event_data["meta"] = {
            "sources": len(new_results),
            "preview": [{"title": r["title"], "url": r["url"]} for r in new_results[:6]],
        }
    elif node_name == "summariser":
        new_summaries = node_output.get("summaries", [])
        event_data["meta"] = {
            "summaries": len(new_summaries),
        }
    elif node_name == "outliner":
        outline = state.get("outline", "")
        event_data["meta"] = {
            "sections": outline.count("## ") if outline else 0,
            "preview": outline[:500] if outline else "",
        }
    elif node_name == "drafter":
        draft = state.get("draft", "")
        event_data["meta"] = {
            "words": len(draft.split()) if draft else 0,
        }
    elif node_name == "reflection":
        event_data["reflection_action"] = state.get("reflection_action", "accept")
        event_data["critique"] = state.get("reflection", "")

    return event_data


async def stream_agent(topic: str, domain: str = "general", byok_keys: dict | None = None):
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
    # Inject BYOK keys into state (nodes check for these)
    if byok_keys:
        state.update(byok_keys)

    def send(event: str, data: dict):
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    yield send("start", {"run_id": run_id, "topic": topic, "domain": domain})

    try:
        # Stream through the graph
        cancelled = False
        async for chunk in lumen_graph.astream(state, stream_mode="updates"):
            if _is_cancelled(run_id):
                _clear_cancelled(run_id)
                cancelled = True
                yield send("cancelled", {"run_id": run_id})
                break
            for node_name, node_output in chunk.items():
                if not node_output:
                    continue
                pre_iteration = state.get("iteration", 0)
                state.update(node_output)
                event_data = _build_node_event(node_name, node_output, state, pre_iteration)
                yield send("node_complete", event_data)
                await asyncio.sleep(0)  # allow flush

        if cancelled:
            return

        # Run evals
        yield send("eval_start", {})
        sources = [r["url"] for r in state.get("search_results", [])]
        scores = score_draft(topic, state.get("draft", ""), sources)
        await save_run(
            run_id, topic, state.get("draft", ""), sources,
            scores, state.get("node_timings", {}), state.get("token_counts", {}),
        )

        # Store state for potential refinement
        _store_run_state(run_id, _strip_secrets(state))

        yield send("complete", {
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
        yield send("error", {"detail": str(e)})



async def stream_refine_real(run_id: str, byok_keys: dict | None = None):
    """Run one additional iteration on an existing research run."""
    state = _run_states.get(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found or expired")

    # Reset iteration so the graph can run a full pass
    state["should_continue"] = False
    state["iteration"] = 0

    # Inject BYOK keys if provided
    if byok_keys:
        state.update(byok_keys)

    def send(event: str, data: dict):
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    yield send("start", {"run_id": run_id, "topic": state["topic"]})

    try:
        # Run through the graph again (full pipeline)
        cancelled = False
        async for chunk in lumen_graph.astream(state, stream_mode="updates"):
            if run_id in _cancelled_runs:
                _cancelled_runs.discard(run_id)
                cancelled = True
                yield send("cancelled", {"run_id": run_id})
                break
            for node_name, node_output in chunk.items():
                if not node_output:
                    continue
                pre_iteration = state.get("iteration", 0)
                state.update(node_output)
                event_data = _build_node_event(node_name, node_output, state, pre_iteration)
                yield send("node_complete", event_data)
                await asyncio.sleep(0)

        if cancelled:
            return

        # Re-evaluate
        yield send("eval_start", {})
        sources = [r["url"] for r in state.get("search_results", [])]
        scores = score_draft(state["topic"], state.get("draft", ""), sources)
        await save_run(
            run_id, state["topic"], state.get("draft", ""), sources,
            scores, state.get("node_timings", {}), state.get("token_counts", {}),
        )

        # Update stored state
        _store_run_state(run_id, _strip_secrets(state))

        yield send("complete", {
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
        yield send("error", {"detail": str(e)})


def _check_limits(client_ip: str, limiter: RateLimiter, is_byok: bool = False):
    """Check rate limits. BYOK users bypass per-IP and global limits."""
    if is_byok:
        return  # User pays with their own keys, no limits

    # Per-IP limit
    allowed, reason = limiter.check(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=json.dumps({"code": reason, "message": _limit_message(reason)}),
        )

    # Global daily cap (only for research, not refine)
    if limiter is research_limiter:
        global_ok, remaining = global_counter.check()
        if not global_ok:
            raise HTTPException(
                status_code=429,
                detail=json.dumps({
                    "code": "global_daily_limit",
                    "message": "Daily research limit reached across all users. Add your own API keys to continue.",
                }),
            )


def _limit_message(reason: str) -> str:
    if reason == "daily_limit":
        return "You've reached the daily research limit. Add your own API keys to continue."
    elif reason == "hourly_limit":
        return "You've reached the hourly research limit. Add your own API keys to continue."
    return "You've made too many requests. Add your own API keys to continue."


@app.post("/api/research")
async def research(req: ResearchRequest, request: Request):
    client_ip = get_client_ip(request)
    _check_limits(client_ip, research_limiter, is_byok=req.is_byok)

    # Concurrency limit (even for BYOK)
    if not concurrency_limiter.acquire(client_ip):
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "code": "concurrent_limit",
                "message": "A research pipeline is already running. Please wait for it to finish.",
            }),
        )

    byok_keys = {}
    if req.is_byok:
        byok_keys = {
            "_byok_anthropic_key": req.anthropic_api_key,
        }

    async def stream_with_release():
        try:
            streamer = stream_agent(req.topic, domain=req.domain, byok_keys=byok_keys)
            async for chunk in streamer:
                yield chunk
        finally:
            concurrency_limiter.release(client_ip)

    return StreamingResponse(
        stream_with_release(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-RateLimit-Remaining-Daily": str(research_limiter.remaining_daily(client_ip)),
        },
    )


@app.post("/api/research/{run_id}/refine")
async def refine(run_id: str, req: RefineRequest, request: Request):
    client_ip = get_client_ip(request)
    _check_limits(client_ip, refine_limiter, is_byok=req.is_byok)

    if run_id not in _run_states:
        raise HTTPException(status_code=404, detail="Run not found or expired")

    if not concurrency_limiter.acquire(client_ip):
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "code": "concurrent_limit",
                "message": "A research pipeline is already running. Please wait for it to finish.",
            }),
        )

    byok_keys = {}
    if req.is_byok:
        byok_keys = {
            "_byok_anthropic_key": req.anthropic_api_key,
        }

    async def stream_with_release():
        try:
            streamer = stream_refine_real(run_id, byok_keys=byok_keys)
            async for chunk in streamer:
                yield chunk
        finally:
            concurrency_limiter.release(client_ip)

    return StreamingResponse(
        stream_with_release(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/domains")
async def get_domains():
    return list_domains()


@app.post("/api/research/{run_id}/cancel")
async def cancel_research(run_id: str):
    _mark_cancelled(run_id)
    return {"status": "cancelling", "run_id": run_id}


@app.get("/api/evals")
async def get_evals(request: Request):
    client_ip = get_client_ip(request)
    allowed, _ = evals_limiter.check(client_ip)
    if not allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")
    return await get_all_runs()


@app.get("/api/research/{run_id}")
async def get_research(run_id: str, request: Request):
    client_ip = get_client_ip(request)
    allowed, _ = evals_limiter.check(client_ip)
    if not allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")
    run = await get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
