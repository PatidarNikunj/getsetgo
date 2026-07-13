"""Point-in-polygon test and boom-barrier zone dwell/direction classification.

A truck is considered to have crossed the barrier once its tracked centroid
dwells inside the configured zone polygon for a minimum number of frames and
then leaves it. Whether that crossing counts as an "entry" or an "exit" is
decided by comparing the centroid's net movement while inside the zone
against the camera's configured "inside" direction vector.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

Point = Tuple[float, float]


def point_in_polygon(point: Point, polygon: List[Point]) -> bool:
    """Ray-casting point-in-polygon test."""
    x, y = point
    inside = False
    x1, y1 = polygon[-1]
    for x2, y2 in polygon:
        if (y1 > y) != (y2 > y):
            x_intersect = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < x_intersect:
                inside = not inside
        x1, y1 = x2, y2
    return inside


@dataclass
class ZoneEvent:
    track_id: int
    direction: str  # "entry" or "exit"
    entry_centroid: Point
    exit_centroid: Point
    dwell_frames: int


@dataclass
class _TrackState:
    inside: bool = False
    entry_centroid: Optional[Point] = None
    dwell_frames: int = 0
    last_seen_frame: int = 0


class BarrierZoneMonitor:
    """Tracks per-truck dwell inside a boom-barrier zone polygon and classifies
    the crossing as an entry or exit once the truck leaves the zone.
    """

    def __init__(
        self,
        polygon: List[Point],
        inside_direction: Point,
        min_dwell_frames: int = 3,
        track_timeout_frames: int = 150,
    ) -> None:
        if len(polygon) < 3:
            raise ValueError("zone polygon needs at least 3 points")
        self.polygon = polygon
        self.inside_direction = inside_direction
        self.min_dwell_frames = min_dwell_frames
        self.track_timeout_frames = track_timeout_frames
        self._tracks: Dict[int, _TrackState] = {}

    def update(self, track_id: int, centroid: Point, frame_idx: int) -> Optional[ZoneEvent]:
        """Feed the latest centroid for a tracked truck. Returns a ZoneEvent
        when this update completes a dwell-then-leave crossing of the zone.
        """
        state = self._tracks.setdefault(track_id, _TrackState())
        state.last_seen_frame = frame_idx
        inside_now = point_in_polygon(centroid, self.polygon)

        event: Optional[ZoneEvent] = None
        if inside_now and not state.inside:
            state.inside = True
            state.entry_centroid = centroid
            state.dwell_frames = 1
        elif inside_now and state.inside:
            state.dwell_frames += 1
        elif not inside_now and state.inside:
            if state.dwell_frames >= self.min_dwell_frames and state.entry_centroid is not None:
                event = self._classify(track_id, state.entry_centroid, centroid, state.dwell_frames)
            state.inside = False
            state.entry_centroid = None
            state.dwell_frames = 0
        return event

    def _classify(
        self, track_id: int, entry_centroid: Point, exit_centroid: Point, dwell_frames: int
    ) -> ZoneEvent:
        dx = exit_centroid[0] - entry_centroid[0]
        dy = exit_centroid[1] - entry_centroid[1]
        dot = dx * self.inside_direction[0] + dy * self.inside_direction[1]
        direction = "entry" if dot >= 0 else "exit"
        return ZoneEvent(track_id, direction, entry_centroid, exit_centroid, dwell_frames)

    def expire_stale_tracks(self, current_frame_idx: int) -> List[int]:
        """Drop tracks that haven't been updated for track_timeout_frames
        (e.g. lost by the tracker). Returns the ids of tracks that were still
        inside the zone when dropped, since those can't be classified without
        a matching exit and should be logged as a caller warning.
        """
        stale_inside: List[int] = []
        for track_id, state in list(self._tracks.items()):
            if current_frame_idx - state.last_seen_frame > self.track_timeout_frames:
                if state.inside:
                    stale_inside.append(track_id)
                del self._tracks[track_id]
        return stale_inside
