"""FastAPI dependencies. Tests override these to avoid real databases and Claude calls."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.agents.summarizer import ClaudeSummarizer, Summarizer, SummarizerError
from app.config import Settings, get_settings
from app.recorder import DbRunRecorder, RunRecorder


def get_recorder(request: Request) -> RunRecorder:
    return DbRunRecorder(request.app.state.db)


_summarizer: ClaudeSummarizer | None = None


def get_summarizer(settings: Annotated[Settings, Depends(get_settings)]) -> Summarizer:
    global _summarizer
    if _summarizer is None:
        try:
            _summarizer = ClaudeSummarizer(settings)
        except SummarizerError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return _summarizer
