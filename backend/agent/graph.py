from langgraph.graph import StateGraph, END
from .state import AgentState
from .nodes import planner_node, searcher_node, summariser_node, outliner_node, drafter_node, reflection_node
import uuid


def reflection_router(state: AgentState) -> str:
    """Route based on reflection action: revise writing, research more, or accept."""
    action = state.get("reflection_action", "accept")
    if action == "revise":
        return "drafter"       # loop back to drafter with critique
    elif action == "research":
        return "searcher"      # loop back to searcher for more sources
    return "end"               # accept — done


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("planner", planner_node)
    graph.add_node("searcher", searcher_node)
    graph.add_node("summariser", summariser_node)
    graph.add_node("outliner", outliner_node)
    graph.add_node("drafter", drafter_node)
    graph.add_node("reflection", reflection_node)

    graph.set_entry_point("planner")
    graph.add_edge("planner", "searcher")
    graph.add_edge("searcher", "summariser")
    graph.add_edge("summariser", "outliner")
    graph.add_edge("outliner", "drafter")
    graph.add_edge("drafter", "reflection")
    graph.add_conditional_edges("reflection", reflection_router, {
        "drafter": "drafter",    # revise: writing quality issues
        "searcher": "searcher",  # research: content gaps
        "end": END,              # accept: draft is good
    })

    return graph.compile()


lumen_graph = build_graph()
