import hashlib
import json
import os
import pickle
import re
from pathlib import Path
from langchain_anthropic import ChatAnthropic
from agent.prompts import JUDGE_PROMPT

llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=200)

DEV_CACHE_ENABLED = os.environ.get("LUMEN_DEV_CACHE", "true").lower() == "true"
CACHE_DIR = Path(os.path.dirname(__file__), "../../.cache")
if DEV_CACHE_ENABLED:
    CACHE_DIR.mkdir(exist_ok=True)


def _parse_json(text: str):
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    return json.loads(text.strip())


def _cached_llm_invoke(prompt: str):
    if not DEV_CACHE_ENABLED:
        return llm.invoke(prompt)
    cache_key = hashlib.sha256(prompt.encode()).hexdigest()[:16]
    path = CACHE_DIR / f"llm_{cache_key}.pkl"
    if path.exists():
        return pickle.loads(path.read_bytes())
    result = llm.invoke(prompt)
    path.write_bytes(pickle.dumps(result))
    return result


def score_draft(topic: str, draft: str, sources: list[str]) -> dict:
    prompt = JUDGE_PROMPT.format(
        topic=topic,
        draft=draft[:4000],
        sources="\n".join(sources[:10]),
    )
    response = _cached_llm_invoke(prompt)
    return _parse_json(response.content)
