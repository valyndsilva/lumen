import json
import os
import time
import uuid
from upstash_redis import Redis


# --- Client ---

redis = Redis(
    url=os.environ.get("UPSTASH_REDIS_URL", ""),
    token=os.environ.get("UPSTASH_REDIS_TOKEN", ""),
)

# TTL constants
RUN_STATE_TTL = 3600      # 1 hour
CANCEL_TTL = 300          # 5 minutes
RATE_WINDOW_MINUTE = 60


# --- Run state ---

def store_run_state(run_id: str, state: dict) -> None:
    redis.set(f"run:{run_id}", json.dumps(state, default=str), ex=RUN_STATE_TTL)


def get_run_state(run_id: str) -> dict | None:
    data = redis.get(f"run:{run_id}")
    if data is None:
        return None
    return json.loads(data)


# --- Cancellation ---

def mark_cancelled(run_id: str) -> None:
    redis.set(f"cancel:{run_id}", "1", ex=CANCEL_TTL)


def is_cancelled(run_id: str) -> bool:
    return redis.exists(f"cancel:{run_id}") == 1


def clear_cancelled(run_id: str) -> None:
    redis.delete(f"cancel:{run_id}")


# --- Rate limiting (sliding window) ---

RATE_LIMITS = {
    "research": [(5, RATE_WINDOW_MINUTE)],
    "refine": [(5, RATE_WINDOW_MINUTE)],
    "evals": [(30, RATE_WINDOW_MINUTE)],
}


def check_rate_limit(user_id: str, limit_type: str) -> tuple[bool, str]:
    """Check rate limits using Redis sorted sets. Returns (allowed, reason)."""
    now = time.time()
    tiers = RATE_LIMITS.get(limit_type, [])

    for max_req, window in tiers:
        key = f"rate:{limit_type}:{user_id}:{window}"
        redis.zremrangebyscore(key, 0, now - window)
        count = redis.zcard(key)
        if count >= max_req:
            return False, "rate_limit"

    member = f"{now}:{uuid.uuid4().hex[:8]}"
    for _, window in tiers:
        key = f"rate:{limit_type}:{user_id}:{window}"
        redis.zadd(key, {member: now})
        redis.expire(key, window + 60)

    return True, ""


# --- Concurrency ---

def acquire_concurrency(user_id: str) -> bool:
    key = f"concurrent:{user_id}"
    # Atomic: SETNX returns True only if the key didn't exist
    result = redis.set(key, "1", nx=True, ex=300)
    return result is not None


def release_concurrency(user_id: str) -> None:
    redis.delete(f"concurrent:{user_id}")
