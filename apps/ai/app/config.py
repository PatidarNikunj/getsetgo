"""Typed settings loaded from environment variables (and apps/ai/.env in development)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    port: int = 8000
    log_level: str = "INFO"

    # Databases (each service has its own database and login — see docs/local-development.md)
    database_url: SecretStr = Field(description="postgresql+asyncpg://user:pass@host:5432/db")
    mongodb_uri: SecretStr = Field(description="mongodb://user:pass@host:27017/db?authSource=db")
    mongodb_db: str = "getsetgo_ai"

    # Service-to-service auth: only apps/api may call this service (OWASP A01/A07).
    service_jwt_secret: SecretStr = Field(min_length=32)
    service_jwt_issuer: str = "getsetgo-api"
    service_jwt_audience: str = "getsetgo-ai"

    # Claude
    anthropic_api_key: SecretStr | None = None
    ai_model: str = "claude-opus-5-5"
    ai_effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    ai_max_tokens: int = 4096
    ai_max_note_chars: int = 20_000

    # Observability (optional)
    sentry_dsn: SecretStr | None = None
    sentry_traces_sample_rate: float = Field(default=0.2, ge=0, le=1)

    @field_validator("anthropic_api_key", "sentry_dsn", mode="before")
    @classmethod
    def _empty_key_is_unset(cls, value: object) -> object:
        # `ANTHROPIC_API_KEY=` in .env means "not configured", not an empty key.
        return None if value == "" else value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # required values come from the environment
