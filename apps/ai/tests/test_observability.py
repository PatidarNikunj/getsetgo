from app.observability import DATA_COLLECTION, scrub_sensitive


def test_scrubs_note_content_and_credentials() -> None:
    event = {
        "request": {"headers": {"Authorization": "Bearer x", "user-agent": "ok"}},
        "extra": {"body": {"title": "Trip", "content": "private"}},
        "breadcrumbs": [{"data": {"api_key": "k"}}],
    }
    assert scrub_sensitive(event) == {
        "request": {"headers": {"Authorization": "[redacted]", "user-agent": "ok"}},
        "extra": {"body": {"title": "Trip", "content": "[redacted]"}},
        "breadcrumbs": [{"data": {"api_key": "[redacted]"}}],
    }


def test_data_collection_is_locked_down() -> None:
    assert DATA_COLLECTION["cookies"] is False
    assert DATA_COLLECTION["http_bodies"] == []
    assert DATA_COLLECTION["gen_ai"] == {"inputs": False, "outputs": False}
