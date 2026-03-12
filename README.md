# Lumen

AI-powered content research agent. Give it a topic, it searches the web, synthesises sources, and writes a structured article — with full observability and quality evals.

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS v4, Zod v4, Recharts
- **Backend**: Python, FastAPI, LangGraph, LangChain
- **LLM**: Anthropic Claude (claude-sonnet-4-6)
- **Search**: Tavily
- **Tracing**: LangSmith
- **Evals**: SQLite + LLM-as-judge

## Architecture

The agent runs as a LangGraph state machine with 5 nodes:

```
Planner → Searcher → Summariser → Drafter → Reflection
                ↑                                 │
                └─────────── loop (max 2) ────────┘
```

1. **Planner** — generates 2 targeted search queries from the topic
2. **Searcher** — runs queries against Tavily (2 results each)
3. **Summariser** — condenses each source with Claude
4. **Drafter** — writes a structured article from the summaries
5. **Reflection** — scores the draft and decides whether to loop back for more research

All runs are scored by an LLM-as-judge (quality, relevance, groundedness) and stored in SQLite. Scores are visible on the `/evals` dashboard.

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- [pnpm](https://pnpm.io/)
- API keys: [Anthropic](https://console.anthropic.com/), [Tavily](https://tavily.com/), [LangSmith](https://smith.langchain.com/) (optional)

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # fill in your API keys
python3 -m uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Development

### Mock Mode

Set `LUMEN_MOCK=true` in `backend/.env` to stream pre-recorded fixture data. This lets you develop the UI with zero API calls.

### Caching

Disk-based caching is enabled by default (`LUMEN_DEV_CACHE=true`). Both Tavily search results and Claude LLM responses are cached in `.cache/` so repeated runs with the same topic don't burn API credits. Disable with `LUMEN_DEV_CACHE=false`.

### Guardrails

- Input validation: 3-500 character topics, prompt injection blocking
- Rate limiting: 5 research requests/min, 30 eval reads/min per IP
- SSE events validated with Zod discriminated union schemas on the frontend

## Environment Variables

See [.env.example](.env.example) for all available variables.

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `TAVILY_API_KEY` | Yes | Tavily search API key |
| `LANGSMITH_API_KEY` | No | LangSmith tracing key |
| `LANGSMITH_TRACING` | No | Enable LangSmith tracing (`true`/`false`) |
| `LANGSMITH_PROJECT` | No | LangSmith project name |
| `LUMEN_DEV_CACHE` | No | Disk cache for LLM/Tavily calls (default: `true`) |
| `LUMEN_MOCK` | No | Mock mode for UI development (default: `false`) |
