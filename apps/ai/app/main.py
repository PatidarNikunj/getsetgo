"""FastAPI entry point for the internal AI service."""

import re
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response

from app.config import get_settings
from app.db.mongo import Mongo
from app.db.postgres import Database
from app.logging import configure_logging, log
from app.routers import health, summaries

settings = get_settings()
configure_logging(settings.log_level, json=settings.is_production)

# Accept an incoming request ID only if it looks safe to log (no log injection, OWASP A09).
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.db = Database(settings.database_url.get_secret_value())
    app.state.mongo = Mongo(settings.mongodb_uri.get_secret_value(), settings.mongodb_db)
    await app.state.mongo.init()
    log.info("startup", environment=settings.environment, model=settings.ai_model)
    yield
    await app.state.db.dispose()
    await app.state.mongo.close()


app = FastAPI(
    title="getsetgo AI service",
    version="0.1.0",
    lifespan=lifespan,
    # API docs only outside production (OWASP A05).
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)


@app.middleware("http")
async def request_context(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    incoming = request.headers.get("x-request-id", "")
    request_id = incoming if _REQUEST_ID_PATTERN.match(incoming) else str(uuid.uuid4())
    request.state.request_id = request_id
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id, path=request.url.path)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(health.router)
app.include_router(summaries.router)
