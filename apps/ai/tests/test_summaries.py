from httpx import AsyncClient

from app.agents.summarizer import SummarizerError
from app.main import app
from tests.conftest import FakeRecorder, FakeStore, FakeSummarizer, make_token

AUTH = {"Authorization": f"Bearer {make_token()}"}
BODY = {"note_id": "n1", "title": "Groceries", "content": "Milk, eggs, bread."}


async def test_summary_success_is_returned_and_recorded(
    client: AsyncClient, summarizer: FakeSummarizer, recorder: FakeRecorder
) -> None:
    response = await client.post("/v1/summaries", json=BODY, headers=AUTH)

    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == "A short summary."
    assert data["key_points"] == ["one", "two"]
    assert data["input_tokens"] == 120
    assert summarizer.calls == [("Groceries", "Milk, eggs, bread.")]
    assert recorder.runs[0]["status"] == "succeeded"
    assert recorder.runs[0]["agent"] == "note-summarizer"


async def test_transcripts_never_contain_note_or_summary_text(
    client: AsyncClient, recorder: FakeRecorder
) -> None:
    await client.post("/v1/summaries", json=BODY, headers=AUTH)

    run = recorder.runs[0]
    assert run["input"] == {"note_id": "n1", "title_chars": 9, "content_chars": 18}
    assert run["output"] == {"summary_chars": 16, "key_points": 2}
    stored = repr(run)
    assert "Groceries" not in stored
    assert "Milk" not in stored
    assert "A short summary." not in stored


async def test_request_id_is_echoed_when_safe(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert response.headers["x-request-id"] == "abc-123"

    response = await client.get("/health", headers={"X-Request-ID": "bad\nvalue"})
    assert response.headers["x-request-id"] != "bad\nvalue"


async def test_refusal_maps_to_422_and_is_recorded(
    client: AsyncClient, summarizer: FakeSummarizer, recorder: FakeRecorder
) -> None:
    summarizer.error = SummarizerError("declined", status="refused")
    response = await client.post("/v1/summaries", json=BODY, headers=AUTH)

    assert response.status_code == 422
    assert recorder.runs[0]["status"] == "refused"


async def test_retryable_failure_maps_to_503(
    client: AsyncClient, summarizer: FakeSummarizer
) -> None:
    summarizer.error = SummarizerError("rate limited", retryable=True)
    response = await client.post("/v1/summaries", json=BODY, headers=AUTH)
    assert response.status_code == 503


async def test_permanent_failure_maps_to_502(
    client: AsyncClient, summarizer: FakeSummarizer
) -> None:
    summarizer.error = SummarizerError("bad key")
    response = await client.post("/v1/summaries", json=BODY, headers=AUTH)
    assert response.status_code == 502


async def test_input_is_validated(client: AsyncClient) -> None:
    too_long = {**BODY, "content": "x" * 20_001}
    assert (await client.post("/v1/summaries", json=too_long, headers=AUTH)).status_code == 422
    empty = {**BODY, "content": ""}
    assert (await client.post("/v1/summaries", json=empty, headers=AUTH)).status_code == 422


async def test_readiness_reports_components(client: AsyncClient) -> None:
    response = await client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "postgres": "up", "mongo": "up"}

    app.state.mongo = FakeStore(up=False)
    response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["mongo"] == "down"


def test_empty_api_key_means_not_configured() -> None:
    from app.config import Settings

    settings = Settings(anthropic_api_key="")
    assert settings.anthropic_api_key is None
