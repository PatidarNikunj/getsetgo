import sqlite3

import pytest

from boomcam.events import BarrierEvent, EventStore


def test_record_and_read_back_event(tmp_path):
    store = EventStore(tmp_path / "events.db")
    try:
        event = BarrierEvent(camera_id="gate-1", track_id=42, direction="entry", dwell_frames=5)
        row_id = store.record(event)
        assert row_id == 1

        rows = store.recent(limit=10)
        assert len(rows) == 1
        assert rows[0]["camera_id"] == "gate-1"
        assert rows[0]["track_id"] == 42
        assert rows[0]["direction"] == "entry"
    finally:
        store.close()


def test_direction_must_be_entry_or_exit(tmp_path):
    store = EventStore(tmp_path / "events.db")
    try:
        with pytest.raises(sqlite3.IntegrityError):
            store.record(
                BarrierEvent(camera_id="gate-1", track_id=1, direction="sideways", dwell_frames=1)
            )
    finally:
        store.close()
