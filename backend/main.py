import json
import os
import uuid
import asyncio
import time
import re
from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from agent.graph import lumen_graph
from evals.judge import score_draft
from evals.store import init_db, save_run, get_all_runs

MOCK_MODE = os.environ.get("LUMEN_MOCK", "false").lower() == "true"


# --- Rate limiter ---

class RateLimiter:
    """Simple in-memory sliding window rate limiter per IP."""

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = {}

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        timestamps = self._requests.get(key, [])
        # Prune old entries
        timestamps = [t for t in timestamps if t > cutoff]
        if len(timestamps) >= self.max_requests:
            self._requests[key] = timestamps
            return False
        timestamps.append(now)
        self._requests[key] = timestamps
        return True

    def remaining(self, key: str) -> int:
        now = time.time()
        cutoff = now - self.window_seconds
        timestamps = [t for t in self._requests.get(key, []) if t > cutoff]
        return max(0, self.max_requests - len(timestamps))


# 5 research requests per minute per IP
research_limiter = RateLimiter(max_requests=5, window_seconds=60)
# 30 evals reads per minute per IP
evals_limiter = RateLimiter(max_requests=30, window_seconds=60)


# --- Input validation ---

TOPIC_MIN_LENGTH = 3
TOPIC_MAX_LENGTH = 500


class ResearchRequest(BaseModel):
    topic: str

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def stream_mock(topic: str):
    """Stream a pre-recorded fixture response. Zero API calls."""
    fixture_path = Path(__file__).parent / "fixtures" / "mock_response.json"
    mock = json.loads(fixture_path.read_text())
    run_id = str(uuid.uuid4())

    def send(event: str, data: dict):
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    yield send("start", {"run_id": run_id, "topic": topic})

    # Simulate node completions with realistic delays
    nodes = ["planner", "searcher", "summariser", "drafter", "reflection"]
    delays = {"planner": 0.3, "searcher": 0.5, "summariser": 1.0, "drafter": 0.8, "reflection": 0.3}
    for node in nodes:
        await asyncio.sleep(delays.get(node, 0.3))
        yield send("node_complete", {
            "node": node,
            "timing_ms": mock["node_timings"].get(node),
            "iteration": 1 if node == "reflection" else 0,
        })

    # Simulate eval
    yield send("eval_start", {})
    await asyncio.sleep(0.5)

    sources = [r["url"] for r in mock["search_results"]]
    scores = mock["scores"]

    await save_run(
        run_id, topic, mock["draft"],
        scores, mock["node_timings"], mock["token_counts"],
    )

    yield send("complete", {
        "draft": mock["draft"],
        "sources": sources,
        "scores": scores,
        "node_timings": mock["node_timings"],
        "token_counts": mock["token_counts"],
        "run_id": run_id,
    })


async def stream_agent(topic: str):
    run_id = str(uuid.uuid4())
    state = {
        "topic": topic,
        "search_queries": [],
        "search_results": [],
        "summaries": [],
        "draft": "",
        "reflection": "",
        "should_continue": False,
        "iteration": 0,
        "node_timings": {},
        "token_counts": {},
        "eval_scores": None,
        "run_id": run_id,
    }

    def send(event: str, data: dict):
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    yield send("start", {"run_id": run_id, "topic": topic})

    # Stream through the graph
    async for chunk in lumen_graph.astream(state, stream_mode="updates"):
        for node_name, node_output in chunk.items():
            state.update(node_output)
            yield send("node_complete", {
                "node": node_name,
                "timing_ms": node_output.get("node_timings", {}).get(node_name),
                "iteration": state.get("iteration", 0),
            })
            await asyncio.sleep(0)  # allow flush

    # Run evals
    yield send("eval_start", {})
    sources = [r["url"] for r in state.get("search_results", [])]
    scores = score_draft(topic, state.get("draft", ""), sources)
    await save_run(
        run_id, topic, state.get("draft", ""),
        scores, state.get("node_timings", {}), state.get("token_counts", {}),
    )

    yield send("complete", {
        "draft": state.get("draft", ""),
        "sources": sources,
        "scores": scores,
        "node_timings": state.get("node_timings", {}),
        "token_counts": state.get("token_counts", {}),
        "run_id": run_id,
    })


@app.post("/api/research")
async def research(req: ResearchRequest, request: Request):
    client_ip = get_client_ip(request)
    if not research_limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Maximum 5 research requests per minute.",
        )
    streamer = stream_mock(req.topic) if MOCK_MODE else stream_agent(req.topic)
    return StreamingResponse(
        streamer,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-RateLimit-Remaining": str(research_limiter.remaining(client_ip)),
        },
    )


@app.get("/api/evals")
async def get_evals(request: Request):
    client_ip = get_client_ip(request)
    if not evals_limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Maximum 30 requests per minute.",
        )
    return await get_all_runs()
