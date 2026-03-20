import json
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from streaming import (
    _sse,
    _strip_secrets,
    _build_node_event,
    stream_research,
    stream_refine,
)


# --- SSE formatting ---

class TestSSE:
    def test_format(self):
        result = _sse("start", {"run_id": "abc"})
        assert result == 'event: start\ndata: {"run_id": "abc"}\n\n'

    def test_empty_data(self):
        result = _sse("eval_start", {})
        assert result == 'event: eval_start\ndata: {}\n\n'


# --- Secret stripping ---

class TestStripSecrets:
    def test_removes_byok_keys(self):
        state = {"topic": "AI", "_byok_anthropic_key": "sk-secret", "draft": "text"}
        result = _strip_secrets(state)
        assert "_byok_anthropic_key" not in result
        assert result["topic"] == "AI"
        assert result["draft"] == "text"

    def test_no_secrets(self):
        state = {"topic": "AI", "draft": "text"}
        assert _strip_secrets(state) == state


# --- Node event building ---

class TestBuildNodeEvent:
    def test_planner_event(self):
        state = {"search_queries": ["q1", "q2"], "iteration": 0}
        result = _build_node_event("planner", {}, state)
        assert result["node"] == "planner"
        assert result["meta"]["queries"] == 2

    def test_searcher_event(self):
        output = {"search_results": [{"title": "T", "url": "http://x"}]}
        state = {"iteration": 0}
        result = _build_node_event("searcher", output, state)
        assert result["meta"]["sources"] == 1
        assert result["meta"]["preview"][0]["title"] == "T"

    def test_drafter_event(self):
        state = {"draft": "one two three", "iteration": 0}
        result = _build_node_event("drafter", {}, state)
        assert result["meta"]["words"] == 3

    def test_reflection_event(self):
        state = {"reflection_action": "revise", "reflection": "needs work", "iteration": 1}
        result = _build_node_event("reflection", {}, state)
        assert result["reflection_action"] == "revise"
        assert result["critique"] == "needs work"

    def test_pre_iteration_override(self):
        state = {"iteration": 2}
        result = _build_node_event("drafter", {}, state, pre_iteration=1)
        assert result["iteration"] == 1

    def test_timing_from_output(self):
        output = {"node_timings": {"planner": 150}}
        state = {"iteration": 0}
        result = _build_node_event("planner", output, state)
        assert result["timing_ms"] == 150


# --- Stream research ---

class TestStreamResearch:
    @pytest.mark.asyncio
    async def test_emits_start_event(self):
        """First event should be 'start' with run_id and topic."""
        mock_graph = MagicMock()
        mock_graph.astream = lambda *a, **kw: aiter_empty()

        with patch("streaming.lumen_graph", mock_graph), \
             patch("streaming.get_user_key_async", new_callable=AsyncMock, return_value=None), \
             patch("streaming.score_draft_async", new_callable=AsyncMock, return_value={"quality": 4.0}), \
             patch("streaming.save_run", new_callable=AsyncMock), \
             patch("streaming.store_run_state"):
            events = []
            async for chunk in stream_research("AI agents", "user-1"):
                events.append(chunk)

        first = _parse_sse(events[0])
        assert first["event"] == "start"
        assert first["data"]["topic"] == "AI agents"
        assert "run_id" in first["data"]

    @pytest.mark.asyncio
    async def test_emits_complete_with_scores(self):
        mock_graph = MagicMock()
        mock_graph.astream = lambda *a, **kw: aiter_empty()

        scores = {"quality": 4.2, "relevance": 4.5, "groundedness": 3.9}

        with patch("streaming.lumen_graph", mock_graph), \
             patch("streaming.get_user_key_async", new_callable=AsyncMock, return_value=None), \
             patch("streaming.score_draft_async", new_callable=AsyncMock, return_value=scores), \
             patch("streaming.save_run", new_callable=AsyncMock), \
             patch("streaming.store_run_state"):
            events = []
            async for chunk in stream_research("AI agents", "user-1"):
                events.append(chunk)

        last = _parse_sse(events[-1])
        assert last["event"] == "complete"
        assert last["data"]["scores"] == scores

    @pytest.mark.asyncio
    async def test_cancellation(self):
        async def fake_stream(*args, **kwargs):
            yield {"planner": {"search_queries": ["q1"]}}

        mock_graph = MagicMock()
        mock_graph.astream = fake_stream

        with patch("streaming.lumen_graph", mock_graph), \
             patch("streaming.get_user_key_async", new_callable=AsyncMock, return_value=None), \
             patch("streaming.is_cancelled", return_value=True), \
             patch("streaming.clear_cancelled"):
            events = []
            async for chunk in stream_research("AI agents", "user-1"):
                events.append(chunk)

        event_types = [_parse_sse(e)["event"] for e in events]
        assert "cancelled" in event_types

    @pytest.mark.asyncio
    async def test_uses_saved_key_when_no_byok(self):
        mock_graph = MagicMock()
        mock_graph.astream = lambda *a, **kw: aiter_empty()

        with patch("streaming.lumen_graph", mock_graph), \
             patch("streaming.get_user_key_async", new_callable=AsyncMock, return_value={"key": "sk-saved"}) as mock_key, \
             patch("streaming.score_draft_async", new_callable=AsyncMock, return_value={}), \
             patch("streaming.save_run", new_callable=AsyncMock), \
             patch("streaming.store_run_state"):
            async for _ in stream_research("AI", "user-1"):
                pass

        mock_key.assert_called_once_with("user-1")


# --- Stream refine ---

class TestStreamRefine:
    @pytest.mark.asyncio
    async def test_missing_run_emits_error(self):
        with patch("streaming.get_run_state", return_value=None):
            events = []
            async for chunk in stream_refine("bad-id", "user-1"):
                events.append(chunk)

        first = _parse_sse(events[0])
        assert first["event"] == "error"
        assert "not found" in first["data"]["detail"].lower()


# --- Helpers ---

def _parse_sse(raw: str) -> dict:
    """Parse an SSE string into {event, data}."""
    lines = raw.strip().split("\n")
    event = ""
    data = ""
    for line in lines:
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            data = line[6:]
    return {"event": event, "data": json.loads(data) if data else {}}


async def aiter_empty():
    """Async iterator that yields nothing."""
    return
    yield  # noqa: unreachable — makes this an async generator
