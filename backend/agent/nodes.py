import hashlib
import json
import pickle
import base64
import re
import time
from langchain_anthropic import ChatAnthropic
from tavily import TavilyClient
from upstash_redis import Redis
from .state import AgentState, SearchResult
from .prompts import (
    PLANNER_PROMPT, SUMMARISER_PROMPT, OUTLINER_PROMPT,
    DRAFTER_PROMPT, DRAFTER_REVISION_PROMPT, REFLECTION_PROMPT
)
from .search_providers import SEARCH_PROVIDERS
from domains import load_domain
import os

from dotenv import load_dotenv
load_dotenv()

llm_fast = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1000)
llm_heavy = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=2000)
tavily = TavilyClient(api_key=os.environ.get("TAVILY_API_KEY", ""))


def _get_clients(state: AgentState) -> tuple:
    """Return (llm_fast, llm_heavy, tavily_client) — uses BYOK Anthropic key if present."""
    byok_anthropic = state.get("_byok_anthropic_key")
    if byok_anthropic:
        return (
            ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1000, api_key=byok_anthropic),
            ChatAnthropic(model="claude-sonnet-4-6", max_tokens=2000, api_key=byok_anthropic),
            tavily,
        )
    return llm_fast, llm_heavy, tavily

# --- Redis-based cache (survives restarts and deploys) ---

CACHE_ENABLED = os.environ.get("LUMEN_DEV_CACHE", "true").lower() == "true"
CACHE_TTL = 604800  # 7 days
LOCAL_CACHE_MAX = 100  # max entries in L1 cache

_cache_redis = None

# --- L1: Local in-memory LRU cache (per-process, zero network cost) ---
_local_cache: dict[str, object] = {}
_local_cache_order: list[str] = []


def _local_get(key: str):
    return _local_cache.get(key)


def _local_set(key: str, value):
    if key in _local_cache:
        _local_cache_order.remove(key)
    elif len(_local_cache) >= LOCAL_CACHE_MAX:
        evict = _local_cache_order.pop(0)
        _local_cache.pop(evict, None)
    _local_cache[key] = value
    _local_cache_order.append(key)


# --- L2: Redis cache (shared across instances, survives restarts) ---

def _get_cache_redis():
    global _cache_redis
    if _cache_redis is None:
        _cache_redis = Redis(
            url=os.environ.get("UPSTASH_REDIS_URL", ""),
            token=os.environ.get("UPSTASH_REDIS_TOKEN", ""),
        )
    return _cache_redis


def _cache_get(prefix: str, key: str):
    """Two-tier cache read: L1 local → L2 Redis."""
    if not CACHE_ENABLED:
        return None

    full_key = f"cache:{prefix}:{key}"

    # L1: local memory (0ms)
    local = _local_get(full_key)
    if local is not None:
        return local

    # L2: Redis (2ms)
    try:
        data = _get_cache_redis().get(full_key)
        if data is not None:
            value = pickle.loads(base64.b64decode(data))
            _local_set(full_key, value)  # promote to L1
            return value
    except Exception:
        pass
    return None


def _cache_set(prefix: str, key: str, value):
    """Write to both L1 local and L2 Redis."""
    if not CACHE_ENABLED:
        return

    full_key = f"cache:{prefix}:{key}"

    # L1: local memory
    _local_set(full_key, value)

    # L2: Redis
    try:
        encoded = base64.b64encode(pickle.dumps(value)).decode()
        _get_cache_redis().set(full_key, encoded, ex=CACHE_TTL)
    except Exception:
        pass  # Redis write failure is non-fatal — L1 still has it


def _cached_search(query: str, max_results: int = 2) -> dict:
    """Search with Redis caching to save Tavily credits."""
    cache_key = hashlib.sha256(f"{query}:{max_results}".encode()).hexdigest()[:16]
    cached = _cache_get("tavily", cache_key)
    if cached is not None:
        return cached
    result = tavily.search(query=query, max_results=max_results)
    _cache_set("tavily", cache_key, result)
    return result


def _cached_llm_invoke(prompt: str, llm=None):
    """LLM invoke with Redis caching. Disable with LUMEN_DEV_CACHE=false."""
    llm = llm or llm_heavy
    if not CACHE_ENABLED:
        return llm.invoke(prompt)
    cache_key = hashlib.sha256(prompt.encode()).hexdigest()[:16]
    cached = _cache_get("llm", cache_key)
    if cached is not None:
        return cached
    result = llm.invoke(prompt)
    _cache_set("llm", cache_key, result)
    return result


def _parse_json(text: str, fallback: dict | list | None = None):
    """Extract and parse JSON from LLM output, handling markdown fences."""
    if not text or not text.strip():
        if fallback is not None:
            return fallback
        raise ValueError("Empty LLM response")
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        if fallback is not None:
            return fallback
        raise


def _track(state: AgentState, node: str, start: float, response) -> dict:
    """Helper to record timing and token usage."""
    elapsed = int((time.time() - start) * 1000)
    timings = dict(state.get("node_timings", {}))
    tokens = dict(state.get("token_counts", {}))
    timings[node] = elapsed
    if hasattr(response, "usage_metadata"):
        tokens[node] = {
            "input": response.usage_metadata.get("input_tokens", 0),
            "output": response.usage_metadata.get("output_tokens", 0),
        }
    return {"node_timings": timings, "token_counts": tokens}


def _is_byok(state: AgentState) -> bool:
    return bool(state.get("_byok_anthropic_key"))


def _get_domain(state: AgentState):
    """Load domain config from state. Cached per domain name."""
    return load_domain(state.get("domain", "general"))


def planner_node(state: AgentState) -> dict:
    start = time.time()
    fast, _, _ = _get_clients(state)
    domain = _get_domain(state)
    domain_ctx = f"\n{domain.planner_context}" if domain.planner_context else ""
    prompt = PLANNER_PROMPT.format(topic=state["topic"]) + domain_ctx
    if _is_byok(state):
        response = fast.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt, llm=fast)
    queries = _parse_json(response.content, fallback=[state["topic"]])
    return {
        "search_queries": queries,
        **_track(state, "planner", start, response),
    }


def _domain_search(query: str, provider: str, max_results: int = 2) -> dict:
    """Search using the domain's provider. Falls back to Tavily for 'tavily'."""
    if provider in SEARCH_PROVIDERS:
        return SEARCH_PROVIDERS[provider](query, max_results=max_results)
    # Default: Tavily
    return _cached_search(query, max_results=max_results)


def searcher_node(state: AgentState) -> dict:
    _, _, tavily_client = _get_clients(state)
    domain = _get_domain(state)
    existing_urls = {r["url"] for r in state.get("search_results", [])}
    results = []
    for query in state["search_queries"]:
        if _is_byok(state) and domain.search_provider == "tavily":
            raw = tavily_client.search(query=query, max_results=2)
        elif domain.search_provider != "tavily":
            raw = _domain_search(query, domain.search_provider, max_results=2)
        else:
            raw = _cached_search(query, max_results=2)
        for r in raw.get("results", []):
            url = r.get("url", "")
            if url and url not in existing_urls:
                existing_urls.add(url)
                results.append(SearchResult(
                    query=query,
                    url=url,
                    title=r.get("title", ""),
                    content=r.get("content", ""),
                ))
    return {"search_results": results}


def summariser_node(state: AgentState) -> dict:
    start = time.time()
    fast, _, _ = _get_clients(state)
    already_done = set(state.get("summarised_urls", []))
    new_results = [r for r in state["search_results"] if r["url"] not in already_done]

    if not new_results:
        return {"summaries": [], "summarised_urls": []}

    sources_block = "\n\n".join(
        f"[{i+1}] {r['title']}\nURL: {r['url']}\n{r['content'][:2000]}"
        for i, r in enumerate(new_results)
    )
    domain = _get_domain(state)
    domain_ctx = f"\n{domain.summariser_context}" if domain.summariser_context else ""
    prompt = SUMMARISER_PROMPT.format(
        topic=state["topic"],
        sources=sources_block,
    ) + domain_ctx
    if _is_byok(state):
        response = fast.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt, llm=fast)

    # Parse numbered summaries back into per-source entries
    raw_summaries = response.content.strip().split("\n")
    summaries = []
    current = []
    for line in raw_summaries:
        # Detect new numbered summary (e.g., "1. ...", "2. ...")
        if line and line[0].isdigit() and ". " in line[:4] and current:
            summaries.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        summaries.append("\n".join(current))

    # Pair summaries with source metadata
    paired = []
    new_urls = []
    for i, result in enumerate(new_results):
        summary_text = summaries[i] if i < len(summaries) else ""
        paired.append(f"[{result['title']}]({result['url']})\n{summary_text}")
        new_urls.append(result["url"])

    return {
        "summaries": paired,
        "summarised_urls": new_urls,
        **_track(state, "summariser", start, response),
    }


def outliner_node(state: AgentState) -> dict:
    """Generate a structured outline on the first pass only. Skips on revision loops."""
    if state.get("outline"):
        return {}

    start = time.time()
    fast, _, _ = _get_clients(state)
    domain = _get_domain(state)
    summaries_text = "\n\n---\n\n".join(state["summaries"])
    domain_ctx = f"\n\nUse this structure:\n{domain.outliner_template}" if domain.outliner_template else ""
    prompt = OUTLINER_PROMPT.format(
        topic=state["topic"],
        summaries=summaries_text,
    ) + domain_ctx
    if _is_byok(state):
        response = fast.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt, llm=fast)
    return {
        "outline": response.content,
        **_track(state, "outliner", start, response),
    }


MAX_REFLECTION_ITERATIONS = 1


def drafter_node(state: AgentState) -> dict:
    start = time.time()
    _, heavy, _ = _get_clients(state)
    reflections = state.get("reflections", [])

    if reflections and state.get("draft"):
        critique_text = "\n\n".join(
            f"[Iteration {i+1}] {r}" for i, r in enumerate(reflections)
        )
        new_research = ""
        if state.get("reflection_action") == "research":
            all_summaries = state.get("summaries", [])
            summarised_urls = state.get("summarised_urls", [])
            recent_count = len(summarised_urls) - len(set(summarised_urls) - set(summarised_urls[-10:]))
            new_summaries = all_summaries[-recent_count:] if recent_count > 0 else []
            if new_summaries:
                new_research = "\n\nNew research to incorporate:\n" + "\n\n---\n\n".join(new_summaries)

        prompt = DRAFTER_REVISION_PROMPT.format(
            topic=state["topic"],
            previous_draft=state["draft"],
            critique=critique_text,
            new_research_section=new_research,
        )
    else:
        summaries_text = "\n\n---\n\n".join(state["summaries"])
        prompt = DRAFTER_PROMPT.format(
            topic=state["topic"],
            outline=state.get("outline", ""),
            summaries=summaries_text,
        )

    if _is_byok(state):
        response = heavy.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt)
    return {
        "draft": response.content,
        **_track(state, "drafter", start, response),
    }


def reflection_node(state: AgentState) -> dict:
    start = time.time()
    fast, _, _ = _get_clients(state)
    domain = _get_domain(state)
    iteration = state.get("iteration", 0)
    domain_ctx = f"\n{domain.reflection_rules}" if domain.reflection_rules else ""
    prompt = REFLECTION_PROMPT.format(
        topic=state["topic"],
        draft=state["draft"],
        iteration=iteration,
        max_iterations=MAX_REFLECTION_ITERATIONS,
    ) + domain_ctx
    if _is_byok(state):
        response = fast.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt, llm=fast)
    result = _parse_json(response.content, fallback={"action": "accept", "critique": "Unable to evaluate — accepting draft."})

    action = result.get("action", "accept")
    critique = result.get("critique", "")

    if action not in ("accept", "revise", "research"):
        action = "accept"
    if iteration >= MAX_REFLECTION_ITERATIONS:
        action = "accept"

    return {
        "reflection": critique,
        "reflections": [critique] if action != "accept" else [],
        "reflection_action": action,
        "should_continue": action != "accept",
        "iteration": iteration + 1,
        "search_queries": result.get("gaps", []) if action == "research" else state.get("search_queries", []),
        **_track(state, "reflection", start, response),
    }
