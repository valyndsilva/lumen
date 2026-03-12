import hashlib
import json
import pickle
import re
import time
import uuid
from pathlib import Path
from langchain_anthropic import ChatAnthropic
from tavily import TavilyClient
from .state import AgentState, SearchResult
from .prompts import (
    PLANNER_PROMPT, SUMMARISER_PROMPT,
    DRAFTER_PROMPT, REFLECTION_PROMPT
)
import os

from dotenv import load_dotenv
load_dotenv()

llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=2000)
tavily = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

# --- Disk-based cache (survives server restarts) ---

DEV_CACHE_ENABLED = os.environ.get("LUMEN_DEV_CACHE", "true").lower() == "true"
CACHE_DIR = Path(os.path.dirname(__file__), "../../.cache")
if DEV_CACHE_ENABLED:
    CACHE_DIR.mkdir(exist_ok=True)


def _cache_get(prefix: str, key: str):
    """Read a cached value from disk."""
    if not DEV_CACHE_ENABLED:
        return None
    path = CACHE_DIR / f"{prefix}_{key}.pkl"
    if path.exists():
        return pickle.loads(path.read_bytes())
    return None


def _cache_set(prefix: str, key: str, value):
    """Write a value to disk cache."""
    if not DEV_CACHE_ENABLED:
        return
    path = CACHE_DIR / f"{prefix}_{key}.pkl"
    path.write_bytes(pickle.dumps(value))


def _cached_search(query: str, max_results: int = 2) -> dict:
    """Search with disk caching to save Tavily credits."""
    cache_key = hashlib.sha256(f"{query}:{max_results}".encode()).hexdigest()[:16]
    cached = _cache_get("tavily", cache_key)
    if cached is not None:
        return cached
    result = tavily.search(query=query, max_results=max_results)
    _cache_set("tavily", cache_key, result)
    return result


def _cached_llm_invoke(prompt: str):
    """LLM invoke with disk caching for dev/testing. Disable with LUMEN_DEV_CACHE=false."""
    if not DEV_CACHE_ENABLED:
        return llm.invoke(prompt)
    cache_key = hashlib.sha256(prompt.encode()).hexdigest()[:16]
    cached = _cache_get("llm", cache_key)
    if cached is not None:
        return cached
    result = llm.invoke(prompt)
    _cache_set("llm", cache_key, result)
    return result


def _parse_json(text: str):
    """Extract and parse JSON from LLM output, handling markdown fences."""
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    return json.loads(text.strip())


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


def planner_node(state: AgentState) -> dict:
    start = time.time()
    prompt = PLANNER_PROMPT.format(topic=state["topic"])
    response = _cached_llm_invoke(prompt)
    queries = _parse_json(response.content)
    return {
        "search_queries": queries,
        **_track(state, "planner", start, response),
    }


def searcher_node(state: AgentState) -> dict:
    results = []
    for query in state["search_queries"]:
        raw = _cached_search(query, max_results=2)
        for r in raw.get("results", []):
            results.append(SearchResult(
                query=query,
                url=r.get("url", ""),
                title=r.get("title", ""),
                content=r.get("content", ""),
            ))
    return {"search_results": results}


def summariser_node(state: AgentState) -> dict:
    start = time.time()
    summaries = []
    last_response = None
    for result in state["search_results"]:
        prompt = SUMMARISER_PROMPT.format(
            topic=state["topic"],
            title=result["title"],
            url=result["url"],
            content=result["content"][:3000],
        )
        response = _cached_llm_invoke(prompt)
        summaries.append(f"[{result['title']}]({result['url']})\n{response.content}")
        last_response = response
    return {
        "summaries": summaries,
        **_track(state, "summariser", start, last_response),
    }


def drafter_node(state: AgentState) -> dict:
    start = time.time()
    summaries_text = "\n\n---\n\n".join(state["summaries"])
    prompt = DRAFTER_PROMPT.format(
        topic=state["topic"],
        summaries=summaries_text,
    )
    response = _cached_llm_invoke(prompt)
    return {
        "draft": response.content,
        **_track(state, "drafter", start, response),
    }


def reflection_node(state: AgentState) -> dict:
    start = time.time()
    prompt = REFLECTION_PROMPT.format(
        topic=state["topic"],
        draft=state["draft"],
        iteration=state.get("iteration", 0),
    )
    response = _cached_llm_invoke(prompt)
    result = _parse_json(response.content)
    return {
        "reflection": result.get("reason", ""),
        "should_continue": result.get("should_continue", False),
        "iteration": state.get("iteration", 0) + 1,
        "search_queries": result.get("gaps", []) if result.get("should_continue") else [],
        **_track(state, "reflection", start, response),
    }
