"""Encrypted API key storage using Supabase + Fernet encryption + Redis cache."""
import os
from cryptography.fernet import Fernet
from supabase import create_client
from upstash_redis import Redis

_fernet = None
_client = None
_redis = None
KEY_CACHE_TTL = 300  # 5 minutes


def _get_fernet():
    global _fernet
    if _fernet is None:
        key = os.environ.get("ENCRYPTION_KEY", "")
        if not key:
            raise ValueError("ENCRYPTION_KEY not set")
        _fernet = Fernet(key.encode())
    return _fernet


def _get_client():
    global _client
    if _client is None:
        _client = create_client(
            os.environ.get("SUPABASE_URL", ""),
            os.environ.get("SUPABASE_KEY", ""),
        )
    return _client


def _get_redis():
    global _redis
    if _redis is None:
        _redis = Redis(
            url=os.environ.get("UPSTASH_REDIS_URL", ""),
            token=os.environ.get("UPSTASH_REDIS_TOKEN", ""),
        )
    return _redis


def encrypt_key(api_key: str) -> str:
    """Encrypt an API key for storage."""
    return _get_fernet().encrypt(api_key.encode()).decode()


def decrypt_key(encrypted: str) -> str:
    """Decrypt a stored API key for use."""
    return _get_fernet().decrypt(encrypted.encode()).decode()


def key_preview(api_key: str) -> str:
    """Return last 4 characters for display: sk-...abc1"""
    return f"...{api_key[-4:]}" if len(api_key) > 4 else "****"


def save_user_key(user_id: str, anthropic_key: str):
    """Encrypt and store a user's API key. Invalidates cache."""
    encrypted = encrypt_key(anthropic_key)
    preview = key_preview(anthropic_key)

    _get_client().table("user_keys").upsert({
        "user_id": user_id,
        "encrypted_anthropic_key": encrypted,
        "key_preview": preview,
        "updated_at": "now()",
    }).execute()

    # Cache the encrypted key in Redis for fast retrieval
    try:
        _get_redis().set(f"userkey:{user_id}", encrypted, ex=KEY_CACHE_TTL)
    except Exception:
        pass


def get_user_key(user_id: str) -> dict | None:
    """Retrieve and decrypt a user's API key. Checks Redis cache first."""
    # Check Redis cache
    try:
        cached = _get_redis().get(f"userkey:{user_id}")
        if cached:
            decrypted = decrypt_key(cached)
            return {"key": decrypted, "preview": key_preview(decrypted)}
    except Exception:
        pass

    # Cache miss — fetch from Supabase
    result = (_get_client()
              .table("user_keys")
              .select("encrypted_anthropic_key, key_preview")
              .eq("user_id", user_id)
              .limit(1)
              .execute())

    if not result.data:
        return None

    row = result.data[0]
    try:
        decrypted = decrypt_key(row["encrypted_anthropic_key"])
        # Cache for next time
        try:
            _get_redis().set(f"userkey:{user_id}", row["encrypted_anthropic_key"], ex=KEY_CACHE_TTL)
        except Exception:
            pass
        return {"key": decrypted, "preview": row["key_preview"]}
    except Exception:
        return None


async def get_user_key_async(user_id: str) -> dict | None:
    """Non-blocking version of get_user_key for use in async pipelines."""
    import asyncio
    return await asyncio.to_thread(get_user_key, user_id)


def get_user_key_preview(user_id: str) -> dict | None:
    """Return just the preview (no decryption). For UI display."""
    result = (_get_client()
              .table("user_keys")
              .select("key_preview, created_at")
              .eq("user_id", user_id)
              .limit(1)
              .execute())

    if not result.data:
        return None

    return result.data[0]


def delete_user_key(user_id: str):
    """Remove a user's stored API key and clear cache."""
    _get_client().table("user_keys").delete().eq("user_id", user_id).execute()
    try:
        _get_redis().delete(f"userkey:{user_id}")
    except Exception:
        pass
