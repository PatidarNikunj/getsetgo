import pytest

from boomcam.geometry import BarrierZoneMonitor, point_in_polygon

SQUARE = [(0, 0), (10, 0), (10, 10), (0, 10)]


def test_point_in_polygon_inside():
    assert point_in_polygon((5, 5), SQUARE)


def test_point_in_polygon_outside():
    assert not point_in_polygon((15, 5), SQUARE)


def test_monitor_emits_entry_when_moving_along_inside_direction():
    monitor = BarrierZoneMonitor(polygon=SQUARE, inside_direction=(0, 1), min_dwell_frames=2)

    assert monitor.update(track_id=1, centroid=(5, -5), frame_idx=1) is None  # approaching, outside
    assert monitor.update(track_id=1, centroid=(5, 5), frame_idx=2) is None  # enters zone
    assert monitor.update(track_id=1, centroid=(5, 5), frame_idx=3) is None  # dwelling
    event = monitor.update(track_id=1, centroid=(5, 15), frame_idx=4)  # leaves, moved +y

    assert event is not None
    assert event.direction == "entry"
    assert event.dwell_frames == 2


def test_monitor_emits_exit_when_moving_against_inside_direction():
    monitor = BarrierZoneMonitor(polygon=SQUARE, inside_direction=(0, 1), min_dwell_frames=2)

    monitor.update(track_id=2, centroid=(5, 15), frame_idx=1)
    monitor.update(track_id=2, centroid=(5, 5), frame_idx=2)
    monitor.update(track_id=2, centroid=(5, 5), frame_idx=3)
    event = monitor.update(track_id=2, centroid=(5, -5), frame_idx=4)

    assert event is not None
    assert event.direction == "exit"


def test_monitor_ignores_brief_flicker_below_min_dwell():
    monitor = BarrierZoneMonitor(polygon=SQUARE, inside_direction=(0, 1), min_dwell_frames=5)

    monitor.update(track_id=3, centroid=(5, 5), frame_idx=1)
    event = monitor.update(track_id=3, centroid=(5, 15), frame_idx=2)  # left after 1 frame

    assert event is None


def test_expire_stale_tracks_reports_tracks_lost_inside_zone():
    monitor = BarrierZoneMonitor(
        polygon=SQUARE, inside_direction=(0, 1), min_dwell_frames=1, track_timeout_frames=5
    )
    monitor.update(track_id=4, centroid=(5, 5), frame_idx=1)

    assert monitor.expire_stale_tracks(current_frame_idx=3) == []  # not stale yet
    assert monitor.expire_stale_tracks(current_frame_idx=10) == [4]


def test_polygon_requires_at_least_three_points():
    with pytest.raises(ValueError):
        BarrierZoneMonitor(polygon=[(0, 0), (1, 1)], inside_direction=(0, 1))
