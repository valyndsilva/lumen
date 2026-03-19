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
    PLANNER_PROMPT, SUMMARISER_PROMPT, OUTLINER_PROMPT,
    DRAFTER_PROMPT, DRAFTER_REVISION_PROMPT, REFLECTION_PROMPT
)
import os

from dotenv import load_dotenv
load_dotenv()

llm_fast = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1000)
llm_heavy = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=2000)
tavily = TavilyClient(api_key=os.environ.get("TAVILY_API_KEY", ""))


def _get_clients(state: AgentState) -> tuple:
    """Return (llm_fast, llm_heavy, tavily_client) — uses BYOK keys if present."""
    byok_anthropic = state.get("_byok_anthropic_key")
    byok_tavily = state.get("_byok_tavily_key")
    if byok_anthropic and byok_tavily:
        return (
            ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1000, api_key=byok_anthropic),
            ChatAnthropic(model="claude-sonnet-4-6", max_tokens=2000, api_key=byok_anthropic),
            TavilyClient(api_key=byok_tavily),
        )
    return llm_fast, llm_heavy, tavily

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


def _cached_llm_invoke(prompt: str, llm=None):
    """LLM invoke with disk caching for dev/testing. Disable with LUMEN_DEV_CACHE=false."""
    llm = llm or llm_heavy
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


def _is_byok(state: AgentState) -> bool:
    return bool(state.get("_byok_anthropic_key"))


def planner_node(state: AgentState) -> dict:
    start = time.time()
    fast, _, _ = _get_clients(state)
    prompt = PLANNER_PROMPT.format(topic=state["topic"])
    if _is_byok(state):
        response = fast.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt, llm=fast)
    queries = _parse_json(response.content)
    return {
        "search_queries": queries,
        **_track(state, "planner", start, response),
    }


def searcher_node(state: AgentState) -> dict:
    _, _, tavily_client = _get_clients(state)
    existing_urls = {r["url"] for r in state.get("search_results", [])}
    results = []
    for query in state["search_queries"]:
        if _is_byok(state):
            raw = tavily_client.search(query=query, max_results=2)
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
    _, heavy, _ = _get_clients(state)
    already_done = set(state.get("summarised_urls", []))
    new_results = [r for r in state["search_results"] if r["url"] not in already_done]

    if not new_results:
        return {"summaries": [], "summarised_urls": []}

    sources_block = "\n\n".join(
        f"[{i+1}] {r['title']}\nURL: {r['url']}\n{r['content'][:2000]}"
        for i, r in enumerate(new_results)
    )
    prompt = SUMMARISER_PROMPT.format(
        topic=state["topic"],
        sources=sources_block,
    )
    if _is_byok(state):
        response = heavy.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt)

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
    summaries_text = "\n\n---\n\n".join(state["summaries"])
    prompt = OUTLINER_PROMPT.format(
        topic=state["topic"],
        summaries=summaries_text,
    )
    if _is_byok(state):
        response = fast.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt, llm=fast)
    return {
        "outline": response.content,
        **_track(state, "outliner", start, response),
    }


MAX_REFLECTION_ITERATIONS = 3


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
    iteration = state.get("iteration", 0)
    prompt = REFLECTION_PROMPT.format(
        topic=state["topic"],
        draft=state["draft"],
        iteration=iteration,
        max_iterations=MAX_REFLECTION_ITERATIONS,
    )
    if _is_byok(state):
        response = fast.invoke(prompt)
    else:
        response = _cached_llm_invoke(prompt, llm=fast)
    result = _parse_json(response.content)

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
