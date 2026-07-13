"""Persistence for boom-barrier truck entry/exit events."""
from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union

_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT NOT NULL,
    track_id INTEGER NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('entry', 'exit')),
    timestamp TEXT NOT NULL,
    dwell_frames INTEGER NOT NULL,
    snapshot_path TEXT
)
"""


@dataclass
class BarrierEvent:
    camera_id: str
    track_id: int
    direction: str
    dwell_frames: int
    timestamp: str = ""
    snapshot_path: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()


class EventStore:
    """Thread-safe SQLite-backed store for truck entry/exit events.

    A single instance is shared across all camera worker threads, so writes
    are serialized behind a lock.
    """

    def __init__(self, db_path: Union[str, Path]) -> None:
        self._path = Path(db_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.execute(_SCHEMA)
            self._conn.commit()

    def record(self, event: BarrierEvent) -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO events (camera_id, track_id, direction, timestamp, "
                "dwell_frames, snapshot_path) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    event.camera_id,
                    event.track_id,
                    event.direction,
                    event.timestamp,
                    event.dwell_frames,
                    event.snapshot_path,
                ),
            )
            self._conn.commit()
            return cur.lastrowid

    def recent(self, limit: int = 50) -> list[sqlite3.Row]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)
            )
            return cur.fetchall()

    def close(self) -> None:
        with self._lock:
            self._conn.close()
