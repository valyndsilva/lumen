from typing import TypedDict, Annotated, List, Optional
import operator

class SearchResult(TypedDict):
    query: str
    url: str
    title: str
    content: str

class EvalScores(TypedDict):
    quality: float        # 1-5
    relevance: float      # 1-5
    groundedness: float   # 1-5
    latency_ms: int
    total_tokens: int
    estimated_cost_usd: float

class AgentState(TypedDict):
    topic: str
    domain: str                     # domain config id (general, medical, legal, financial)
    search_queries: List[str]
    search_results: Annotated[List[SearchResult], operator.add]
    summarised_urls: Annotated[List[str], operator.add]  # URLs already summarised
    summaries: Annotated[List[str], operator.add]
    outline: str
    draft: str
    reflection: str
    reflections: Annotated[List[str], operator.add]  # accumulated critiques
    reflection_action: str   # "accept", "revise", or "research"
    should_continue: bool
    iteration: int
    node_timings: dict          # node_name -> ms
    token_counts: dict          # node_name -> {input, output}
    eval_scores: Optional[EvalScores]
    run_id: str
    _byok_anthropic_key: Optional[str]  # BYOK key — passed through state, stripped before persistence
