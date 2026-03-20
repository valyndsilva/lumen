import json
import os
import re
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from auth.clerk import get_user_id
from auth.keys import save_user_key, get_user_key_preview, delete_user_key
from domains import list_domains
from evals.store import init_db, get_all_runs, get_run
from redis_services import (
    get_run_state,
    mark_cancelled,
    check_rate_limit,
    acquire_concurrency,
    release_concurrency,
)
from streaming import stream_research, stream_refine


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


class SaveKeyRequest(BaseModel):
    anthropic_api_key: str


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


# --- Helpers ---

def _check_limits(user_id: str, limit_type: str, is_byok: bool = False) -> None:
    """Check rate limits. BYOK users bypass per-user limits."""
    if is_byok:
        return
    allowed, reason = check_rate_limit(user_id, limit_type)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "code": reason,
                "message": "Too many requests. Please wait a moment and try again.",
            }),
        )


def _require_concurrency(user_id: str) -> None:
    """Acquire a concurrency slot or raise 429."""
    if not acquire_concurrency(user_id):
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "code": "concurrent_limit",
                "message": "A research pipeline is already running. Please wait for it to finish.",
            }),
        )


def _byok_keys(api_key: str | None) -> dict:
    """Build BYOK keys dict from an optional API key."""
    if api_key:
        return {"_byok_anthropic_key": api_key}
    return {}


# --- Endpoints ---

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/api/research")
async def research(req: ResearchRequest, user_id: str = Depends(get_user_id)):
    _check_limits(user_id, "research", is_byok=req.is_byok)
    _require_concurrency(user_id)

    async def stream_with_release():
        try:
            async for chunk in stream_research(
                req.topic, user_id, domain=req.domain, byok_keys=_byok_keys(req.anthropic_api_key),
            ):
                yield chunk
        finally:
            release_concurrency(user_id)

    return StreamingResponse(
        stream_with_release(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/research/{run_id}/refine")
async def refine(run_id: str, req: RefineRequest, user_id: str = Depends(get_user_id)):
    _check_limits(user_id, "refine", is_byok=req.is_byok)
    if not get_run_state(run_id):
        raise HTTPException(status_code=404, detail="Run not found or expired")
    _require_concurrency(user_id)

    async def stream_with_release():
        try:
            async for chunk in stream_refine(run_id, user_id, byok_keys=_byok_keys(req.anthropic_api_key)):
                yield chunk
        finally:
            release_concurrency(user_id)

    return StreamingResponse(
        stream_with_release(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/research/{run_id}/cancel")
async def cancel_research(run_id: str, user_id: str = Depends(get_user_id)):
    mark_cancelled(run_id)
    return {"status": "cancelling", "run_id": run_id}


@app.get("/api/research/{run_id}")
async def get_research(run_id: str, user_id: str = Depends(get_user_id)):
    run = await get_run(run_id, user_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@app.get("/api/domains")
async def get_domains():
    return list_domains()


# --- Key management ---

@app.get("/api/keys")
async def check_keys(user_id: str = Depends(get_user_id)):
    """Check if user has a saved API key."""
    preview = get_user_key_preview(user_id)
    if not preview:
        return {"has_key": False}
    return {"has_key": True, "preview": preview["key_preview"], "created_at": preview.get("created_at")}


@app.post("/api/keys")
async def save_keys(req: SaveKeyRequest, user_id: str = Depends(get_user_id)):
    """Encrypt and save the user's API key."""
    if not req.anthropic_api_key.startswith("sk-"):
        raise HTTPException(status_code=400, detail="Invalid API key format")
    save_user_key(user_id, req.anthropic_api_key)
    return {"status": "saved"}


@app.delete("/api/keys")
async def remove_keys(user_id: str = Depends(get_user_id)):
    """Delete the user's stored API key."""
    delete_user_key(user_id)
    return {"status": "deleted"}


@app.get("/api/evals")
async def get_evals(user_id: str = Depends(get_user_id)):
    return await get_all_runs(user_id)
