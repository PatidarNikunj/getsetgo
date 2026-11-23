import time

import pytest
from httpx import AsyncClient

from tests.conftest import make_token

BODY = {"note_id": "n1", "title": "Groceries", "content": "Milk, eggs, bread."}


async def post(client: AsyncClient, token: str | None) -> int:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = await client.post("/v1/summaries", json=BODY, headers=headers)
    return response.status_code


async def test_valid_token_is_accepted(client: AsyncClient) -> None:
    assert await post(client, make_token()) == 200


async def test_missing_token_is_rejected(client: AsyncClient) -> None:
    assert await post(client, None) == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"_secret": "a-different-secret-that-is-also-32-chars-long"},
        {"aud": "someone-else"},
        {"iss": "not-the-api"},
        {"exp": int(time.time()) - 120},
        {"exp": int(time.time()) + 3600},  # lifetime longer than allowed
    ],
    ids=["wrong-secret", "wrong-audience", "wrong-issuer", "expired", "too-long-lived"],
)
async def test_bad_tokens_are_rejected(client: AsyncClient, overrides: dict[str, object]) -> None:
    assert await post(client, make_token(**overrides)) == 401


async def test_unsigned_token_is_rejected(client: AsyncClient) -> None:
    import jwt

    token = jwt.encode({"iss": "getsetgo-api", "aud": "getsetgo-ai"}, None, algorithm="none")
    assert await post(client, token) == 401


async def test_health_needs_no_token(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
