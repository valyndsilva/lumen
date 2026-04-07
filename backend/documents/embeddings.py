"""Embedding via Voyage AI — Anthropic's recommended embedding partner.

Uses voyage-3-lite (512 dimensions) with the server's API key.
Cost is negligible (~$0.02 per million tokens) so the operator pays,
consistent with how Tavily search uses a server key.
"""

import os
import voyageai

_client = None


def _get_client() -> voyageai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("VOYAGE_API_KEY", "")
        if not api_key:
            raise RuntimeError("VOYAGE_API_KEY is required for the documents domain")
        _client = voyageai.Client(api_key=api_key)
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns list of 1024-dim vectors."""
    if not texts:
        return []
    client = _get_client()
    result = client.embed(texts, model="voyage-3-lite", input_type="document")
    return result.embeddings


def embed_query(query: str) -> list[float]:
    """Embed a single search query. Returns 1024-dim vector."""
    client = _get_client()
    result = client.embed([query], model="voyage-3-lite", input_type="query")
    return result.embeddings[0]
