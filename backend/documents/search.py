"""Search provider for the documents domain — semantic similarity over user uploads."""

from .embeddings import embed_query
from .store import search_chunks


def search_documents(query: str, user_id: str, max_results: int = 5) -> dict:
    """Embed query and search user's document chunks via pgvector.

    Returns results in the same format as other search providers:
    {"results": [{"url": ..., "title": ..., "content": ...}]}

    Uses doc:// URL scheme to distinguish from web sources.
    """
    if not user_id:
        return {"results": []}

    query_embedding = embed_query(query)
    matches = search_chunks(query_embedding, user_id, match_count=max_results)

    results = []
    for match in matches:
        results.append({
            "url": f"doc://{match['document_id']}#{match['chunk_id']}",
            "title": match.get("document_name", "Uploaded Document"),
            "content": match.get("chunk_text", ""),
        })

    return {"results": results}
