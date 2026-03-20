import hashlib
import json
import os
import pickle
import base64
import re
from langchain_anthropic import ChatAnthropic
from upstash_redis import Redis
from agent.prompts import JUDGE_PROMPT


_judge_client_cache: dict[str, ChatAnthropic] = {}
_JUDGE_CACHE_MAX = 50


def _get_llm(api_key: str | None = None) -> ChatAnthropic:
    """Get or create a cached judge LLM client, using BYOK key if provided."""
    cache_key = api_key or "_default"
    if cache_key not in _judge_client_cache:
        if len(_judge_client_cache) >= _JUDGE_CACHE_MAX:
            _judge_client_cache.pop(next(iter(_judge_client_cache)))
        kwargs = {"model": "claude-haiku-4-5-20251001", "max_tokens": 200}
        if api_key:
            kwargs["api_key"] = api_key
        _judge_client_cache[cache_key] = ChatAnthropic(**kwargs)
    return _judge_client_cache[cache_key]

CACHE_ENABLED = os.environ.get("LUMEN_DEV_CACHE", "true").lower() == "true"
CACHE_TTL = 604800  # 7 days

_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        _redis = Redis(
            url=os.environ.get("UPSTASH_REDIS_URL", ""),
            token=os.environ.get("UPSTASH_REDIS_TOKEN", ""),
        )
    return _redis


def _parse_json(text: str):
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    return json.loads(text.strip())


def _cached_llm_invoke(prompt: str, api_key: str | None = None):
    if CACHE_ENABLED:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()[:8] if api_key else "default"
        cache_key = hashlib.sha256(f"{prompt}:{key_hash}".encode()).hexdigest()[:16]
        try:
            data = _get_redis().get(f"cache:judge:{cache_key}")
            if data is not None:
                return pickle.loads(base64.b64decode(data))
        except Exception:
            pass
    else:
        cache_key = None

    llm = _get_llm(api_key)
    result = llm.invoke(prompt)

    if CACHE_ENABLED and cache_key:
        try:
            encoded = base64.b64encode(pickle.dumps(result)).decode()
            _get_redis().set(f"cache:judge:{cache_key}", encoded, ex=CACHE_TTL)
        except Exception:
            pass
    return result


def score_draft(topic: str, draft: str, sources: list[str], api_key: str | None = None) -> dict:
    prompt = JUDGE_PROMPT.format(
        topic=topic,
        draft=draft[:4000],
        sources="\n".join(sources[:10]),
    )
    response = _cached_llm_invoke(prompt, api_key=api_key)
    return _parse_json(response.content)


async def score_draft_async(topic: str, draft: str, sources: list[str], api_key: str | None = None) -> dict:
    """Non-blocking version of score_draft for use in async streaming pipelines."""
    import asyncio
    return await asyncio.to_thread(score_draft, topic, draft, sources, api_key)
