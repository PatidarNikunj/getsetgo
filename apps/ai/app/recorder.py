"""Persists every agent run: metrics in Postgres (AgentRun), full input/output in Mongo."""

from typing import Any, Protocol
from uuid import UUID, uuid4

from app.db.mongo import Transcript
from app.db.postgres import AgentRun, Database
from app.logging import log


class RunRecorder(Protocol):
    async def record(
        self,
        *,
        agent: str,
        model: str,
        status: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        request_id: str | None,
        input: dict[str, Any],
        output: dict[str, Any] | None,
        error: str | None,
    ) -> UUID: ...


class DbRunRecorder:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def record(
        self,
        *,
        agent: str,
        model: str,
        status: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        request_id: str | None,
        input: dict[str, Any],
        output: dict[str, Any] | None,
        error: str | None,
    ) -> UUID:
        run_id = uuid4()
        async with self._db.sessions() as session:
            session.add(
                AgentRun(
                    id=run_id,
                    agent=agent,
                    model=model,
                    status=status,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=latency_ms,
                    request_id=request_id,
                    error=error,
                )
            )
            await session.commit()
        try:
            await Transcript(
                run_id=run_id, agent=agent, model=model, input=input, output=output
            ).insert()
        except Exception:
            # Metrics are already saved; a missing transcript shouldn't fail the request.
            log.exception("recorder.transcript_failed", run_id=str(run_id))
        return run_id
