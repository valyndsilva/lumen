import json
import time
from unittest.mock import patch

import pytest
from redis_services import (
    store_run_state,
    get_run_state,
    mark_cancelled,
    is_cancelled,
    clear_cancelled,
    check_rate_limit,
    acquire_concurrency,
    release_concurrency,
)


# --- Run state ---

class TestRunState:
    def test_store_and_retrieve(self, patch_redis):
        state = {"topic": "AI agents", "draft": "Some text"}
        store_run_state("run-1", state)
        result = get_run_state("run-1")
        assert result["topic"] == "AI agents"
        assert result["draft"] == "Some text"

    def test_get_missing_run(self, patch_redis):
        assert get_run_state("nonexistent") is None

    def test_overwrite_existing(self, patch_redis):
        store_run_state("run-1", {"draft": "v1"})
        store_run_state("run-1", {"draft": "v2"})
        assert get_run_state("run-1")["draft"] == "v2"


# --- Cancellation ---

class TestCancellation:
    def test_mark_and_check(self, patch_redis):
        assert is_cancelled("run-1") is False
        mark_cancelled("run-1")
        assert is_cancelled("run-1") is True

    def test_clear_cancelled(self, patch_redis):
        mark_cancelled("run-1")
        clear_cancelled("run-1")
        assert is_cancelled("run-1") is False

    def test_separate_runs(self, patch_redis):
        mark_cancelled("run-1")
        assert is_cancelled("run-2") is False


# --- Rate limiting ---

class TestRateLimit:
    def test_allows_under_limit(self, patch_redis):
        allowed, reason = check_rate_limit("user-1", "research")
        assert allowed is True
        assert reason == ""

    def test_blocks_over_limit(self, patch_redis):
        for _ in range(5):
            check_rate_limit("user-1", "research")
        allowed, reason = check_rate_limit("user-1", "research")
        assert allowed is False
        assert reason == "rate_limit"

    def test_separate_users(self, patch_redis):
        for _ in range(5):
            check_rate_limit("user-1", "research")
        allowed, _ = check_rate_limit("user-2", "research")
        assert allowed is True

    def test_separate_limit_types(self, patch_redis):
        for _ in range(5):
            check_rate_limit("user-1", "research")
        allowed, _ = check_rate_limit("user-1", "refine")
        assert allowed is True

    def test_unknown_limit_type_always_allows(self, patch_redis):
        allowed, _ = check_rate_limit("user-1", "unknown")
        assert allowed is True


# --- Concurrency ---

class TestConcurrency:
    def test_acquire_and_release(self, patch_redis):
        assert acquire_concurrency("user-1") is True
        assert acquire_concurrency("user-1") is False
        release_concurrency("user-1")
        assert acquire_concurrency("user-1") is True

    def test_separate_users(self, patch_redis):
        assert acquire_concurrency("user-1") is True
        assert acquire_concurrency("user-2") is True

    def test_release_without_acquire(self, patch_redis):
        release_concurrency("user-1")  # Should not raise
