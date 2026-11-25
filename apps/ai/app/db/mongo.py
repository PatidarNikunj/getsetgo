"""MongoDB via Beanie (Pydantic ODM on PyMongo's async client)."""

from datetime import UTC, datetime
from typing import Any, ClassVar
from uuid import UUID

from beanie import Document, init_beanie
from pydantic import Field
from pymongo import AsyncMongoClient

# Fields older transcripts used to store; removed at startup (purge_text_fields).
TEXT_FIELDS = ("input.title", "input.content", "output.summary", "output.key_points")


class Transcript(Document):
    """Metadata of an agent run (sizes, model, ids). Never note or summary text."""

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
        await self.purge_text_fields()

    async def purge_text_fields(self) -> int:
        """Remove note/summary text from transcripts written before sizes-only (idempotent)."""
        collection = self.client[self.db_name][Transcript.Settings.name]
        result = await collection.update_many(
            {"$or": [{field: {"$exists": True}} for field in TEXT_FIELDS]},
            {"$unset": dict.fromkeys(TEXT_FIELDS, "")},
        )
        return result.modified_count

    async def ping(self) -> bool:
        try:
            await self.client.admin.command("ping")
            return True
        except Exception:
            return False

    async def close(self) -> None:
        await self.client.close()
