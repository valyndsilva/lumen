"""Search providers for different domains. Each returns results in a common format."""
import urllib.parse
import httpx


def search_pubmed(query: str, max_results: int = 2) -> dict:
    """Search PubMed via NCBI E-utilities (free, no API key needed)."""
    # Step 1: Search for article IDs
    search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    search_params = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
        "sort": "relevance",
    }
    resp = httpx.get(search_url, params=search_params, timeout=15)
    resp.raise_for_status()
    ids = resp.json().get("esearchresult", {}).get("idlist", [])

    if not ids:
        return {"results": []}

    # Step 2: Fetch article summaries
    fetch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    fetch_params = {
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "json",
    }
    resp = httpx.get(fetch_url, params=fetch_params, timeout=15)
    resp.raise_for_status()
    data = resp.json().get("result", {})

    # Step 3: Fetch abstracts
    abstract_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    abstract_params = {
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "xml",
        "rettype": "abstract",
    }
    abstract_resp = httpx.get(abstract_url, params=abstract_params, timeout=15)
    abstract_text = abstract_resp.text

    results = []
    for pmid in ids:
        article = data.get(pmid, {})
        title = article.get("title", "")
        # Extract authors
        authors = article.get("authors", [])
        author_str = ", ".join(a.get("name", "") for a in authors[:3])
        if len(authors) > 3:
            author_str += " et al."
        # Extract publication info
        source = article.get("source", "")
        pub_date = article.get("pubdate", "")

        # Try to extract abstract from XML
        abstract = ""
        start = abstract_text.find(f"<PMID>{pmid}</PMID>")
        if start != -1:
            abs_start = abstract_text.find("<AbstractText", start)
            abs_end = abstract_text.find("</Abstract>", start)
            if abs_start != -1 and abs_end != -1:
                raw = abstract_text[abs_start:abs_end]
                # Strip XML tags
                import re
                abstract = re.sub(r"<[^>]+>", "", raw).strip()

        content = f"Authors: {author_str}\nPublished: {source}, {pub_date}\n\n{abstract}" if abstract else f"Authors: {author_str}\nPublished: {source}, {pub_date}"

        results.append({
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "title": title,
            "content": content,
        })

    return {"results": results}


def search_courtlistener(query: str, max_results: int = 2) -> dict:
    """Search CourtListener for US case law (free, no API key needed for basic search)."""
    search_url = "https://www.courtlistener.com/api/rest/v4/search/"
    params = {
        "q": query,
        "type": "o",  # opinions
        "format": "json",
    }
    headers = {"User-Agent": "Lumen Research Agent (portfolio project)"}

    try:
        resp = httpx.get(search_url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        # Fallback: scrape-free search via their simple API
        return {"results": []}

    results = []
    for item in data.get("results", [])[:max_results]:
        case_name = item.get("caseName", "")
        court = item.get("court", "")
        date = item.get("dateFiled", "")
        snippet = item.get("snippet", "")
        # Clean HTML from snippet
        import re
        snippet = re.sub(r"<[^>]+>", "", snippet)

        absolute_url = item.get("absolute_url", "")
        url = f"https://www.courtlistener.com{absolute_url}" if absolute_url else ""

        content = f"Court: {court}\nDate: {date}\n\n{snippet}"

        results.append({
            "url": url,
            "title": case_name,
            "content": content,
        })

    return {"results": results}


def search_sec_edgar(query: str, max_results: int = 2) -> dict:
    """Search SEC EDGAR full-text search (free, no API key needed)."""
    search_url = "https://efts.sec.gov/LATEST/search-index"
    params = {
        "q": query,
        "dateRange": "custom",
        "startdt": "2023-01-01",
        "forms": "10-K,10-Q,8-K",
    }
    headers = {
        "User-Agent": "Lumen Research Agent lumen@example.com",
        "Accept": "application/json",
    }

    try:
        # Use EDGAR full-text search API
        search_resp = httpx.get(
            "https://efts.sec.gov/LATEST/search-index",
            params={"q": query, "forms": "10-K,10-Q,8-K"},
            headers=headers,
            timeout=15,
        )
        search_resp.raise_for_status()
        data = search_resp.json()
    except Exception:
        # Fallback to EDGAR full text search
        try:
            fallback_url = f"https://efts.sec.gov/LATEST/search-index?q={urllib.parse.quote(query)}&forms=10-K,10-Q,8-K"
            search_resp = httpx.get(fallback_url, headers=headers, timeout=15)
            search_resp.raise_for_status()
            data = search_resp.json()
        except Exception:
            return {"results": []}

    results = []
    hits = data.get("hits", {}).get("hits", [])[:max_results]
    for hit in hits:
        source = hit.get("_source", {})
        company = source.get("display_names", [""])[0] if source.get("display_names") else ""
        form_type = source.get("form_type", "")
        filed = source.get("file_date", "")
        file_num = source.get("file_num", "")

        # Build URL to filing
        accession = source.get("accession_no", "").replace("-", "")
        url = f"https://www.sec.gov/Archives/edgar/data/{file_num}/{accession}" if accession else ""

        content_snippet = source.get("text", "")[:2000]

        results.append({
            "url": url,
            "title": f"{company} — {form_type} ({filed})",
            "content": f"Company: {company}\nFiling: {form_type}\nDate: {filed}\n\n{content_snippet}",
        })

    return {"results": results}


# Provider registry
SEARCH_PROVIDERS = {
    "pubmed": search_pubmed,
    "courtlistener": search_courtlistener,
    "sec_edgar": search_sec_edgar,
}
