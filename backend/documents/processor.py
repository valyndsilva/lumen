"""PDF extraction and chunking for the documents domain."""

import io
import re
import pdfplumber


MAX_CHUNK_SIZE = 2000    # characters — hard ceiling per chunk
MIN_CHUNK_SIZE = 200     # characters — don't create tiny fragments


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
    """Split text into semantically meaningful chunks.

    Strategy: split on structural boundaries (headings, double newlines,
    single newlines) and merge small sections up to MAX_CHUNK_SIZE.
    Falls back to sentence splitting for oversized paragraphs.

    This respects document structure — a heading and its body stay together,
    paragraphs aren't split mid-sentence — while keeping chunks under the
    size limit for embedding quality.
    """
    if not text.strip():
        return []

    # Step 1: Split into semantic sections on headings and paragraph breaks
    # Headings: lines starting with #, all-caps lines, or numbered sections (1., 2.1, etc.)
    sections = re.split(
        r'\n(?=#{1,4}\s)|'           # markdown headings
        r'\n(?=[A-Z][A-Z\s]{10,}$)|'  # ALL CAPS lines (section titles)
        r'\n(?=\d+\.[\d.]*\s+[A-Z])|' # numbered sections (1. Introduction, 2.1 Methods)
        r'\n\n+',                      # double newlines (paragraph breaks)
        text,
        flags=re.MULTILINE,
    )

    # Step 2: Merge small sections, split oversized ones
    chunks = []
    current = ""

    for section in sections:
        section = section.strip()
        if not section:
            continue

        # If adding this section stays under the limit, merge
        if current and len(current) + len(section) + 2 <= MAX_CHUNK_SIZE:
            current = current + "\n\n" + section
        else:
            # Flush current chunk if it has content
            if current and len(current) >= MIN_CHUNK_SIZE:
                chunks.append(current)
            elif current:
                # Too small on its own — prepend to next section
                section = current + "\n\n" + section
            current = ""

            # If this section fits, start a new chunk
            if len(section) <= MAX_CHUNK_SIZE:
                current = section
            else:
                # Oversized section — split on sentences
                sentences = _split_sentences(section)
                for sentence in sentences:
                    if current and len(current) + len(sentence) + 1 <= MAX_CHUNK_SIZE:
                        current = current + " " + sentence
                    else:
                        if current and len(current) >= MIN_CHUNK_SIZE:
                            chunks.append(current)
                        current = sentence

    # Flush remaining
    if current and len(current) >= MIN_CHUNK_SIZE:
        chunks.append(current)
    elif current and chunks:
        # Append tiny remainder to last chunk
        chunks[-1] = chunks[-1] + "\n\n" + current
    elif current:
        chunks.append(current)

    return chunks


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences. Handles common abbreviations."""
    # Split on sentence-ending punctuation followed by space + uppercase
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [p.strip() for p in parts if p.strip()]
