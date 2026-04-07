"""Supabase CRUD for user documents and vector chunks."""

import os
import uuid
from supabase import create_client

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = create_client(
            os.environ.get("SUPABASE_URL", ""),
            os.environ.get("SUPABASE_KEY", ""),
        )
    return _client


def save_document(user_id: str, filename: str, page_count: int) -> str:
    """Create a document metadata record. Returns the document ID."""
    doc_id = str(uuid.uuid4())
    storage_path = f"documents/{user_id}/{doc_id}/{filename}"
    _get_client().table("user_documents").insert({
        "id": doc_id,
        "user_id": user_id,
        "filename": filename,
        "storage_path": storage_path,
        "page_count": page_count,
        "chunk_count": 0,
    }).execute()
    return doc_id


def save_chunks(document_id: str, user_id: str, chunks: list[str], embeddings: list[list[float]]) -> int:
    """Store chunks with embeddings. Returns chunk count."""
    rows = []
    for i, (text, embedding) in enumerate(zip(chunks, embeddings)):
        rows.append({
            "document_id": document_id,
            "user_id": user_id,
            "chunk_index": i,
            "chunk_text": text,
            "embedding": embedding,
        })

    # Batch insert (Supabase handles this efficiently)
    if rows:
        _get_client().table("document_chunks").insert(rows).execute()

    # Update chunk count on the document
    _get_client().table("user_documents").update({
        "chunk_count": len(rows),
    }).eq("id", document_id).execute()

    return len(rows)


def list_documents(user_id: str) -> list[dict]:
    """List all documents for a user."""
    result = (
        _get_client()
        .table("user_documents")
        .select("id, filename, page_count, chunk_count, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def delete_document(document_id: str, user_id: str) -> bool:
    """Delete a document and its chunks (cascades via FK). Returns True if found."""
    result = (
        _get_client()
        .table("user_documents")
        .delete()
        .eq("id", document_id)
        .eq("user_id", user_id)
        .execute()
    )
    return len(result.data) > 0


def search_chunks(query_embedding: list[float], user_id: str, match_count: int = 5) -> list[dict]:
    """Semantic search over a user's document chunks via pgvector."""
    result = _get_client().rpc("match_documents", {
        "query_embedding": query_embedding,
        "match_count": match_count,
        "filter_user_id": user_id,
    }).execute()
    return result.data
