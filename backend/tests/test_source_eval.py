"""Tests for component-level source trustworthiness evaluation."""
import pytest
from evals.source_eval import evaluate_sources, _extract_domain, _is_trusted, TRUSTED_DOMAINS


class TestExtractDomain:
    def test_simple_url(self):
        assert _extract_domain("https://pubmed.ncbi.nlm.nih.gov/12345") == "pubmed.ncbi.nlm.nih.gov"

    def test_www_stripped(self):
        assert _extract_domain("https://www.nature.com/articles/123") == "nature.com"

    def test_empty(self):
        assert _extract_domain("") == ""

    def test_invalid(self):
        assert _extract_domain("not-a-url") == ""


class TestIsTrusted:
    def test_exact_match(self):
        assert _is_trusted("https://nih.gov/page", {"nih.gov"})

    def test_subdomain_match(self):
        assert _is_trusted("https://pubmed.ncbi.nlm.nih.gov/12345", {"nih.gov"})

    def test_no_match(self):
        assert not _is_trusted("https://random-blog.com/article", {"nih.gov"})

    def test_www_stripped(self):
        assert _is_trusted("https://www.nature.com/articles/123", {"nature.com"})


class TestEvaluateSources:
    def test_medical_all_trusted(self):
        urls = [
            "https://pubmed.ncbi.nlm.nih.gov/12345",
            "https://www.nih.gov/research",
            "https://www.who.int/news",
        ]
        result = evaluate_sources(urls, "medical")
        assert result["total_sources"] == 3
        assert result["trusted_sources"] == 3
        assert result["trusted_ratio"] == 1.0
        assert len(result["untrusted_urls"]) == 0

    def test_medical_mixed(self):
        urls = [
            "https://pubmed.ncbi.nlm.nih.gov/12345",
            "https://random-health-blog.com/cure",
            "https://www.nature.com/articles/123",
        ]
        result = evaluate_sources(urls, "medical")
        assert result["total_sources"] == 3
        assert result["trusted_sources"] == 2
        assert result["trusted_ratio"] == 0.67
        assert len(result["untrusted_urls"]) == 1

    def test_legal_trusted(self):
        urls = [
            "https://www.courtlistener.com/opinion/123",
            "https://law.cornell.edu/uscode/text/42",
        ]
        result = evaluate_sources(urls, "legal")
        assert result["trusted_sources"] == 2
        assert result["trusted_ratio"] == 1.0

    def test_financial_mixed(self):
        urls = [
            "https://www.sec.gov/cgi-bin/browse-edgar",
            "https://finance.yahoo.com/quote/AAPL",
            "https://seekingalpha.com/article/123",
        ]
        result = evaluate_sources(urls, "financial")
        assert result["trusted_sources"] == 2
        assert result["untrusted_urls"] == ["https://seekingalpha.com/article/123"]

    def test_general_domain_trusted(self):
        """General domain checks against preferred web sources."""
        urls = [
            "https://en.wikipedia.org/wiki/AI",
            "https://arxiv.org/abs/2401.12345",
            "https://random-blog.com/post",
        ]
        result = evaluate_sources(urls, "general")
        assert result["trusted_sources"] == 2
        assert result["total_sources"] == 3
        assert "random-blog.com/post" in result["untrusted_urls"][0]

    def test_general_edu_domains_trusted(self):
        """General domain trusts all .edu domains."""
        urls = [
            "https://cs.stanford.edu/paper",
            "https://mit.edu/research",
        ]
        result = evaluate_sources(urls, "general")
        assert result["trusted_sources"] == 2
        assert result["trusted_ratio"] == 1.0

    def test_empty_urls(self):
        result = evaluate_sources([], "medical")
        assert result["total_sources"] == 0
        assert result["trusted_ratio"] == 0.0

    def test_unknown_domain_treated_as_neutral(self):
        """Unknown research domains with no trusted list return neutral (all trusted)."""
        result = evaluate_sources(["https://example.com"], "unknown_domain")
        assert result["trusted_ratio"] == 1.0

    def test_trusted_domains_found_populated(self):
        urls = [
            "https://www.nih.gov/research",
            "https://www.nature.com/2",
            "https://www.who.int/news",
        ]
        result = evaluate_sources(urls, "medical")
        assert "nih.gov" in result["trusted_domains_found"]
        assert "nature.com" in result["trusted_domains_found"]
        assert "who.int" in result["trusted_domains_found"]
