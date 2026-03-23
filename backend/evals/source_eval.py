"""Component-level evaluation: source trustworthiness scoring.

Checks whether the searcher retrieved URLs from trusted domains
for each research domain. Runs automatically after the pipeline —
no LLM calls, no extra cost.
"""

from urllib.parse import urlparse

# Trusted domains per research domain
TRUSTED_DOMAINS: dict[str, set[str]] = {
    "medical": {
        "pubmed.ncbi.nlm.nih.gov",
        "ncbi.nlm.nih.gov",
        "nih.gov",
        "who.int",
        "cochranelibrary.com",
        "thelancet.com",
        "nejm.org",
        "bmj.com",
        "nature.com",
        "sciencedirect.com",
    },
    "legal": {
        "courtlistener.com",
        "law.cornell.edu",
        "supremecourt.gov",
        "uscourts.gov",
        "justice.gov",
        "scholar.google.com",
        "casetext.com",
    },
    "financial": {
        "sec.gov",
        "edgar.sec.gov",
        "investor.gov",
        "finance.yahoo.com",
        "reuters.com",
        "bloomberg.com",
        "wsj.com",
    },
    "general": {
        # Reference & encyclopedias
        "wikipedia.org",
        "britannica.com",
        # Academic & research
        "arxiv.org",
        "nature.com",
        "science.org",
        "sciencedirect.com",
        "springer.com",
        "acm.org",
        "ieee.org",
        "pnas.org",
        # Government & institutions
        "nasa.gov",
        "nih.gov",
        "noaa.gov",
        "gov.uk",
        ".edu",
        # Major news & analysis
        "reuters.com",
        "apnews.com",
        "bbc.com",
        "bbc.co.uk",
        "nytimes.com",
        "theguardian.com",
        "economist.com",
        "washingtonpost.com",
        # Tech
        "techcrunch.com",
        "arstechnica.com",
        "wired.com",
        "theverge.com",
    },
}


def _extract_domain(url: str) -> str:
    """Extract the registrable domain from a URL."""
    try:
        hostname = urlparse(url).hostname or ""
        # Strip www. prefix
        if hostname.startswith("www."):
            hostname = hostname[4:]
        return hostname.lower()
    except Exception:
        return ""


def _is_trusted(url: str, trusted: set[str]) -> bool:
    """Check if a URL's domain matches any trusted domain (including subdomains).

    Supports:
    - Exact match: "nature.com" matches "nature.com"
    - Subdomain match: "pubmed.ncbi.nlm.nih.gov" matches "nih.gov"
    - TLD-level match: ".edu" matches "mit.edu", "stanford.edu", etc.
    """
    hostname = _extract_domain(url)
    if not hostname:
        return False
    for trusted_domain in trusted:
        # TLD-level entry (e.g. ".edu", ".gov")
        if trusted_domain.startswith("."):
            if hostname.endswith(trusted_domain):
                return True
        # Exact or subdomain match
        elif hostname == trusted_domain or hostname.endswith(f".{trusted_domain}"):
            return True
    return False


def evaluate_sources(urls: list[str], domain: str) -> dict:
    """Evaluate source trustworthiness for a given research domain.

    Returns:
        {
            "total_sources": 8,
            "trusted_sources": 6,
            "trusted_ratio": 0.75,
            "trusted_domains_found": ["nih.gov", "pubmed.ncbi.nlm.nih.gov"],
            "untrusted_urls": ["https://random-blog.com/..."],
        }
    """
    trusted_set = TRUSTED_DOMAINS.get(domain, set())

    # General domain: no trusted list, return neutral result
    if not trusted_set:
        return {
            "total_sources": len(urls),
            "trusted_sources": len(urls),
            "trusted_ratio": 1.0,
            "trusted_domains_found": [],
            "untrusted_urls": [],
        }

    trusted_count = 0
    trusted_domains_found: set[str] = set()
    untrusted_urls: list[str] = []

    for url in urls:
        if _is_trusted(url, trusted_set):
            trusted_count += 1
            hostname = _extract_domain(url)
            # Find which trusted domain matched
            for td in trusted_set:
                if hostname == td or hostname.endswith(f".{td}"):
                    trusted_domains_found.add(td)
                    break
        else:
            untrusted_urls.append(url)

    total = len(urls)
    return {
        "total_sources": total,
        "trusted_sources": trusted_count,
        "trusted_ratio": round(trusted_count / total, 2) if total > 0 else 0.0,
        "trusted_domains_found": sorted(trusted_domains_found),
        "untrusted_urls": untrusted_urls,
    }
