"""POST /v1/summaries: summarize a note with Claude. Called only by apps/api."""

import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.agents.summarizer import Summarizer, SummarizerError
from app.config import Settings, get_settings
from app.dependencies import get_recorder, get_summarizer
from app.logging import log
from app.recorder import RunRecorder
from app.security import ServiceClaims

router = APIRouter(prefix="/v1/summaries", tags=["summaries"])

AGENT_NAME = "note-summarizer"


class SummaryRequest(BaseModel):
    note_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20_000)


class SummaryResponse(BaseModel):
    run_id: UUID
    summary: str
    key_points: list[str]
    model: str
    input_tokens: int
    output_tokens: int


@router.post(
    "",
    response_model=SummaryResponse,
    responses={
        401: {"description": "Missing or invalid service token"},
        422: {"description": "Claude declined to summarize the note"},
        502: {"description": "Claude failed to produce a summary"},
        503: {"description": "Claude is not configured or temporarily unavailable"},
    },
)
async def create_summary(
    body: SummaryRequest,
    request: Request,
    _claims: ServiceClaims,
    settings: Annotated[Settings, Depends(get_settings)],
    summarizer: Annotated[Summarizer, Depends(get_summarizer)],
    recorder: Annotated[RunRecorder, Depends(get_recorder)],
) -> SummaryResponse:
    if len(body.content) > settings.ai_max_note_chars:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Note is too long to summarize")

    request_id = getattr(request.state, "request_id", None)
    run_input = {"note_id": body.note_id, "title": body.title, "content": body.content}
    started = time.perf_counter()
    try:
        result = await summarizer.summarize(body.title, body.content)
    except SummarizerError as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        await recorder.record(
            agent=AGENT_NAME,
            model=settings.ai_model,
            status=exc.status,
            input_tokens=0,
            output_tokens=0,
            latency_ms=latency_ms,
            request_id=request_id,
            input=run_input,
            output=None,
            error=str(exc),
        )
        log.warning("summary.failed", note_id=body.note_id, status=exc.status, error=str(exc))
        if exc.status == "refused":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
        code = status.HTTP_503_SERVICE_UNAVAILABLE if exc.retryable else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(code, str(exc)) from exc

    latency_ms = int((time.perf_counter() - started) * 1000)
    run_id = await recorder.record(
        agent=AGENT_NAME,
        model=result.model,
        status="succeeded",
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        latency_ms=latency_ms,
        request_id=request_id,
        input=run_input,
        output=result.summary.model_dump(),
        error=None,
    )
    log.info(
        "summary.succeeded",
        note_id=body.note_id,
        run_id=str(run_id),
        latency_ms=latency_ms,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
    return SummaryResponse(
        run_id=run_id,
        summary=result.summary.summary,
        key_points=result.summary.key_points,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
