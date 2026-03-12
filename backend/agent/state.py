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
    search_queries: List[str]
    search_results: Annotated[List[SearchResult], operator.add]
    summaries: Annotated[List[str], operator.add]
    draft: str
    reflection: str
    should_continue: bool
    iteration: int
    node_timings: dict          # node_name -> ms
    token_counts: dict          # node_name -> {input, output}
    eval_scores: Optional[EvalScores]
    run_id: str
