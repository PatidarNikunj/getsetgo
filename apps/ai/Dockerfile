# syntax=docker/dockerfile:1
# FastAPI AI service image. Build from the repo root:  docker build -f apps/ai/Dockerfile .

FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY apps/ai/pyproject.toml apps/ai/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY apps/ai/app ./app
COPY apps/ai/migrations ./migrations
COPY apps/ai/alembic.ini ./

FROM python:3.13-slim AS runtime
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 ENVIRONMENT=production PORT=8000
RUN useradd --create-home --uid 1001 app
WORKDIR /app
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/health', timeout=2)"
# Apply pending migrations, then start. (On Render this is split into a pre-deploy step.)
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
