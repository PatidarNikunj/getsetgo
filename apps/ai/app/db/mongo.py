"""MongoDB via Beanie (Pydantic ODM on PyMongo's async client)."""

from datetime import UTC, datetime
from typing import Any, ClassVar
from uuid import UUID

from beanie import Document, init_beanie
from pydantic import Field
from pymongo import AsyncMongoClient


class Transcript(Document):
    """Full input/output of an agent run, for debugging and evaluating prompts."""

    run_id: UUID
    agent: str
    model: str
    input: dict[str, Any]
    output: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "transcripts"
        indexes: ClassVar[list[str]] = ["run_id", "created_at"]


class Mongo:
    def __init__(self, uri: str, db_name: str) -> None:
        self.client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(
            uri, serverSelectionTimeoutMS=3000
        )
        self.db_name = db_name

    async def init(self) -> None:
        await init_beanie(database=self.client[self.db_name], document_models=[Transcript])

    async def ping(self) -> bool:
        try:
            await self.client.admin.command("ping")
            return True
        except Exception:
            return False

    async def close(self) -> None:
        await self.client.close()
