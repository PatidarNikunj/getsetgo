"""Test fixtures: no real databases or Claude calls; fakes are injected via dependency overrides."""

import os
import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID, uuid4

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": "postgresql+asyncpg://test:test@localhost:1/test",
        "MONGODB_URI": "mongodb://localhost:1",
        "SERVICE_JWT_SECRET": "test-secret-that-is-at-least-32-characters-long",
        "ANTHROPIC_API_KEY": "",
    }
)

from app.agents.summarizer import NoteSummary, SummarizerError, SummaryResult
from app.dependencies import get_recorder, get_summarizer
from app.main import app

SECRET = os.environ["SERVICE_JWT_SECRET"]


def make_token(**overrides: Any) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "iss": "getsetgo-api",
        "aud": "getsetgo-ai",
        "sub": "getsetgo-api",
        "iat": now,
        "exp": now + 60,
    }
    claims.update(overrides)
    secret = claims.pop("_secret", SECRET)
    return jwt.encode(claims, secret, algorithm="HS256")


class FakeSummarizer:
    def __init__(self) -> None:
        self.error: SummarizerError | None = None
        self.calls: list[tuple[str, str]] = []

    async def summarize(self, title: str, content: str) -> SummaryResult:
        self.calls.append((title, content))
        if self.error:
            raise self.error
        return SummaryResult(
            summary=NoteSummary(summary="A short summary.", key_points=["one", "two"]),
            model="claude-opus-5-5",
            input_tokens=120,
            output_tokens=40,
        )


class FakeRecorder:
    def __init__(self) -> None:
        self.runs: list[dict[str, Any]] = []

    async def record(self, **kwargs: Any) -> UUID:
        self.runs.append(kwargs)
        return uuid4()


class FakeStore:
    def __init__(self, up: bool) -> None:
        self.up = up

    async def ping(self) -> bool:
        return self.up


@pytest.fixture
def summarizer() -> FakeSummarizer:
    return FakeSummarizer()


@pytest.fixture
def recorder() -> FakeRecorder:
    return FakeRecorder()


@pytest.fixture
async def client(summarizer: FakeSummarizer, recorder: FakeRecorder) -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[get_summarizer] = lambda: summarizer
    app.dependency_overrides[get_recorder] = lambda: recorder
    app.state.db = FakeStore(up=True)
    app.state.mongo = FakeStore(up=True)
    # ASGITransport skips the lifespan, so no real connections are opened.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
