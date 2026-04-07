"""LLM provider abstraction — swap models per node via environment config.

The pipeline graph doesn't care which LLM backs a node. This module
creates the right client based on configuration, supporting Anthropic
(default), OpenAI, and Google Gemini.

Config via environment variables:
    LLM_PROVIDER=anthropic              (default)
    LLM_FAST_MODEL=claude-haiku-4-5-20251001
    LLM_HEAVY_MODEL=claude-sonnet-4-6

    LLM_PROVIDER=openai
    LLM_FAST_MODEL=gpt-4o-mini
    LLM_HEAVY_MODEL=gpt-4o
    OPENAI_API_KEY=sk-...

    LLM_PROVIDER=google
    LLM_FAST_MODEL=gemini-2.0-flash
    LLM_HEAVY_MODEL=gemini-2.5-pro
    GOOGLE_API_KEY=...
"""

import os

DEFAULT_PROVIDER = os.environ.get("LLM_PROVIDER", "anthropic")

# Default models per provider — overridable via env vars
PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "anthropic": {"fast": "claude-haiku-4-5-20251001", "heavy": "claude-sonnet-4-6"},
    "openai": {"fast": "gpt-4o-mini", "heavy": "gpt-4o"},
    "google": {"fast": "gemini-2.0-flash", "heavy": "gemini-2.5-pro"},
}

LLM_FAST_MODEL = os.environ.get("LLM_FAST_MODEL")
LLM_HEAVY_MODEL = os.environ.get("LLM_HEAVY_MODEL")
LLM_FAST_MAX_TOKENS = int(os.environ.get("LLM_FAST_MAX_TOKENS", "1000"))
LLM_HEAVY_MAX_TOKENS = int(os.environ.get("LLM_HEAVY_MAX_TOKENS", "4096"))


def get_supported_providers() -> list[dict]:
    """Return list of supported providers for the frontend."""
    return [
        {"id": "anthropic", "label": "Anthropic (Claude)", "key_prefix": "sk-ant-", "key_url": "https://console.anthropic.com/"},
        {"id": "openai", "label": "OpenAI (GPT)", "key_prefix": "sk-", "key_url": "https://platform.openai.com/api-keys"},
        {"id": "google", "label": "Google (Gemini)", "key_prefix": "AI", "key_url": "https://aistudio.google.com/apikey"},
    ]


def create_llm(model: str, max_tokens: int, api_key: str | None = None, provider: str | None = None):
    """Create an LLM client for the specified provider.

    All providers return a LangChain-compatible chat model with an .invoke() method,
    so the pipeline nodes work identically regardless of provider.
    """
    provider = (provider or DEFAULT_PROVIDER).lower()

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        kwargs = {"model": model, "max_tokens": max_tokens}
        if api_key:
            kwargs["api_key"] = api_key
        return ChatAnthropic(**kwargs)

    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        kwargs = {"model": model, "max_tokens": max_tokens}
        if api_key:
            kwargs["api_key"] = api_key
        return ChatOpenAI(**kwargs)

    elif provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        kwargs = {"model": model, "max_output_tokens": max_tokens}
        if api_key:
            kwargs["google_api_key"] = api_key
        return ChatGoogleGenerativeAI(**kwargs)

    else:
        raise ValueError(f"Unknown LLM provider: {provider}. Supported: anthropic, openai, google")


def create_fast(api_key: str | None = None, provider: str | None = None):
    """Create a fast/cheap LLM client (planner, summariser, outliner, reflection, judge)."""
    p = provider or DEFAULT_PROVIDER
    model = LLM_FAST_MODEL or PROVIDER_DEFAULTS.get(p, {}).get("fast", "claude-haiku-4-5-20251001")
    return create_llm(model, LLM_FAST_MAX_TOKENS, api_key, provider=p)


def create_heavy(api_key: str | None = None, provider: str | None = None):
    """Create a heavy/quality LLM client (drafter)."""
    p = provider or DEFAULT_PROVIDER
    model = LLM_HEAVY_MODEL or PROVIDER_DEFAULTS.get(p, {}).get("heavy", "claude-sonnet-4-6")
    return create_llm(model, LLM_HEAVY_MAX_TOKENS, api_key, provider=p)
