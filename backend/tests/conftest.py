import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure backend root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# --- Fake Redis ---

class FakeRedis:
    """In-memory Redis stand-in for tests."""

    def __init__(self):
        self._store: dict[str, str] = {}
        self._zsets: dict[str, dict[str, float]] = {}
        self._ttls: dict[str, int] = {}

    def get(self, key: str) -> str | None:
        return self._store.get(key)

    def set(self, key: str, value: str, ex: int | None = None, nx: bool = False):
        if nx and key in self._store:
            return None
        self._store[key] = value
        if ex:
            self._ttls[key] = ex
        return True

    def delete(self, key: str) -> None:
        self._store.pop(key, None)
        self._zsets.pop(key, None)
        self._ttls.pop(key, None)

    def exists(self, key: str) -> int:
        return 1 if key in self._store else 0

    def zadd(self, key: str, mapping: dict[str, float]) -> None:
        if key not in self._zsets:
            self._zsets[key] = {}
        self._zsets[key].update(mapping)

    def zcard(self, key: str) -> int:
        return len(self._zsets.get(key, {}))

    def zremrangebyscore(self, key: str, min_score: float, max_score: float) -> None:
        if key in self._zsets:
            self._zsets[key] = {
                m: s for m, s in self._zsets[key].items()
                if not (min_score <= s <= max_score)
            }

    def expire(self, key: str, seconds: int) -> None:
        self._ttls[key] = seconds


@pytest.fixture
def fake_redis():
    """Provide a fresh FakeRedis instance."""
    return FakeRedis()


@pytest.fixture
def patch_redis(fake_redis):
    """Patch redis_services.redis with FakeRedis."""
    with patch("redis_services.redis", fake_redis):
        yield fake_redis
