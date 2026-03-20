import time
from unittest.mock import MagicMock, patch, AsyncMock

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

from auth.clerk import get_user_id


# --- Helpers ---

def _generate_rsa_keypair():
    """Generate an RSA key pair for test JWTs."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    return private_key, public_key


def _encode_jwt(payload: dict, private_key, kid: str = "test-kid") -> str:
    return pyjwt.encode(payload, private_key, algorithm="RS256", headers={"kid": kid})


# --- Tests ---

class TestGetUserId:
    @pytest.mark.asyncio
    async def test_missing_auth_header(self):
        request = MagicMock()
        request.headers = {}
        with pytest.raises(Exception, match="Missing authentication token"):
            await get_user_id(request)

    @pytest.mark.asyncio
    async def test_invalid_bearer_prefix(self):
        request = MagicMock()
        request.headers = {"Authorization": "Basic abc123"}
        with pytest.raises(Exception, match="Missing authentication token"):
            await get_user_id(request)

    @pytest.mark.asyncio
    async def test_valid_token(self):
        private_key, public_key = _generate_rsa_keypair()
        issuer = "https://test.clerk.accounts.dev"

        token = _encode_jwt(
            {"sub": "user_123", "iss": issuer, "exp": int(time.time()) + 3600},
            private_key,
        )

        mock_signing_key = MagicMock()
        mock_signing_key.key = public_key

        mock_client = MagicMock()
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        request = MagicMock()
        request.headers = {"Authorization": f"Bearer {token}"}

        with patch("auth.clerk._get_jwks_client", return_value=mock_client), \
             patch("auth.clerk.CLERK_ISSUER_URL", issuer):
            user_id = await get_user_id(request)

        assert user_id == "user_123"

    @pytest.mark.asyncio
    async def test_expired_token(self):
        private_key, public_key = _generate_rsa_keypair()
        issuer = "https://test.clerk.accounts.dev"

        token = _encode_jwt(
            {"sub": "user_123", "iss": issuer, "exp": int(time.time()) - 100},
            private_key,
        )

        mock_signing_key = MagicMock()
        mock_signing_key.key = public_key

        mock_client = MagicMock()
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        request = MagicMock()
        request.headers = {"Authorization": f"Bearer {token}"}

        with patch("auth.clerk._get_jwks_client", return_value=mock_client), \
             patch("auth.clerk.CLERK_ISSUER_URL", issuer):
            with pytest.raises(Exception, match="Token expired"):
                await get_user_id(request)

    @pytest.mark.asyncio
    async def test_wrong_issuer_rejected(self):
        private_key, public_key = _generate_rsa_keypair()

        token = _encode_jwt(
            {"sub": "user_123", "iss": "https://evil.example.com", "exp": int(time.time()) + 3600},
            private_key,
        )

        mock_signing_key = MagicMock()
        mock_signing_key.key = public_key

        mock_client = MagicMock()
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        request = MagicMock()
        request.headers = {"Authorization": f"Bearer {token}"}

        with patch("auth.clerk._get_jwks_client", return_value=mock_client), \
             patch("auth.clerk.CLERK_ISSUER_URL", "https://legit.clerk.accounts.dev"):
            with pytest.raises(Exception, match="Invalid token"):
                await get_user_id(request)

    @pytest.mark.asyncio
    async def test_token_without_sub_claim(self):
        private_key, public_key = _generate_rsa_keypair()
        issuer = "https://test.clerk.accounts.dev"

        token = _encode_jwt(
            {"iss": issuer, "exp": int(time.time()) + 3600},
            private_key,
        )

        mock_signing_key = MagicMock()
        mock_signing_key.key = public_key

        mock_client = MagicMock()
        mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        request = MagicMock()
        request.headers = {"Authorization": f"Bearer {token}"}

        with patch("auth.clerk._get_jwks_client", return_value=mock_client), \
             patch("auth.clerk.CLERK_ISSUER_URL", issuer):
            with pytest.raises(Exception, match="no user ID"):
                await get_user_id(request)
