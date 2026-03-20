import os
import jwt
from fastapi import HTTPException, Request


CLERK_ISSUER_URL = os.environ.get("CLERK_ISSUER_URL", "")
_jwks_client: jwt.PyJWKClient | None = None


def _get_jwks_client() -> jwt.PyJWKClient:
    """Lazily create a cached JWKS client pinned to the configured Clerk issuer."""
    global _jwks_client
    if _jwks_client is None:
        if not CLERK_ISSUER_URL:
            raise RuntimeError("CLERK_ISSUER_URL is not configured")
        _jwks_client = jwt.PyJWKClient(
            f"{CLERK_ISSUER_URL}/.well-known/jwks.json",
            cache_keys=True,
            lifespan=3600,
        )
    return _jwks_client


async def get_user_id(request: Request) -> str:
    """Extract and verify user_id from Clerk JWT in Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = auth_header[7:]

    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER_URL,
            options={"verify_aud": False},
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")

        return user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")
