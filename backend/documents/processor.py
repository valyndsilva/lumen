"""PDF extraction and chunking for the documents domain."""

import io
import pdfplumber


CHUNK_SIZE = 2000       # characters (~500 tokens)
CHUNK_OVERLAP = 200     # character overlap for context continuity


def extract_text(pdf_bytes: bytes) -> tuple[str, int]:
    """Extract text from a PDF. Returns (full_text, page_count)."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages), len(pdf.pages)


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping fixed-size chunks.

    Fixed-size chunking is simple, predictable, and well-understood.
    Each chunk overlaps with the previous by CHUNK_OVERLAP characters
    to preserve context across boundaries.
    """
    if not text.strip():
        return []

    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP  # overlap with previous chunk

    return chunks
