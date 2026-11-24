"""Sentry for the AI service: errors + tracing, continuing the trace started in apps/api.

Disabled without SENTRY_DSN. Collection is locked down because this service handles note text
and Claude prompts/responses (OWASP A09); the same rules as apps/api and the web apps.
"""

import re
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.config import Settings

_SENSITIVE_KEY = re.compile(
    r"pass(word)?|secret|token|authorization|cookie|api[-_]?key|content|summary", re.I
)
_REDACTED = "[redacted]"

# Sentry collects cookies, headers, bodies and AI inputs/outputs by default: turn that off.
DATA_COLLECTION: Any = {
    "user_info": False,
    "cookies": False,
    "http_headers": {
        "request": {
            "allow": ["user-agent", "content-type", "x-request-id", "sentry-trace", "baggage"]
        },
        "response": False,
    },
    "http_bodies": [],
    "url_query_params": False,
    "graphql": {"document": False, "variables": False},
    "gen_ai": {"inputs": False, "outputs": False},
    "mcp": {"inputs": False, "outputs": False},
    "database_query_data": False,
    "queues": False,
    "stack_frame_variables": False,
}


def scrub_sensitive(value: Any, depth: int = 0) -> Any:
    """Replace sensitive values anywhere in an event (same rules as the TypeScript packages)."""
    if depth > 6:
        return value
    if isinstance(value, dict):
        return {
            k: _REDACTED
            if isinstance(k, str) and _SENSITIVE_KEY.search(k)
            else scrub_sensitive(v, depth + 1)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [scrub_sensitive(v, depth + 1) for v in value]
    return value


def _before_send(event: Any, _hint: Any) -> Any:
    return scrub_sensitive(event)


def init_sentry(settings: Settings) -> bool:
    """Initialise Sentry if configured. Returns whether it was enabled."""
    if not settings.sentry_dsn:
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn.get_secret_value(),
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        data_collection=DATA_COLLECTION,
        before_send=_before_send,
        # This service only calls Claude; never forward trace headers to third parties.
        trace_propagation_targets=[],
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )
    return True
