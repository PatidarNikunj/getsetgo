"""Per-camera worker: reads an RTSP stream, runs detection/tracking, and
feeds centroids into a BarrierZoneMonitor to emit entry/exit events.
"""
from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

import cv2

from .config import CameraConfig, StorageConfig
from .detector import TruckDetector
from .events import BarrierEvent, EventStore
from .geometry import BarrierZoneMonitor, ZoneEvent

logger = logging.getLogger(__name__)

_RECONNECT_DELAY_SECONDS = 5


class CameraWorker(threading.Thread):
    def __init__(
        self,
        camera: CameraConfig,
        detector: TruckDetector,
        event_store: EventStore,
        storage: StorageConfig,
    ) -> None:
        super().__init__(name=f"camera-{camera.id}", daemon=True)
        self._camera = camera
        self._detector = detector
        self._event_store = event_store
        self._snapshot_dir = Path(storage.snapshot_dir)
        self._snapshot_dir.mkdir(parents=True, exist_ok=True)
        self._zone_monitor = BarrierZoneMonitor(
            polygon=camera.zone,
            inside_direction=camera.inside_direction,
            min_dwell_frames=camera.min_dwell_frames,
            track_timeout_frames=camera.track_timeout_frames,
        )
        self._stop_event = threading.Event()

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        frame_idx = 0
        cap = self._open_stream()
        try:
            while not self._stop_event.is_set():
                ok, frame = cap.read()
                if not ok:
                    logger.warning("camera %s: lost stream, reconnecting", self._camera.id)
                    cap.release()
                    time.sleep(_RECONNECT_DELAY_SECONDS)
                    cap = self._open_stream()
                    continue

                frame_idx += 1
                for detection in self._detector.track(frame):
                    zone_event = self._zone_monitor.update(
                        detection.track_id, detection.centroid, frame_idx
                    )
                    if zone_event is not None:
                        self._handle_event(zone_event, frame)

                for stale_track_id in self._zone_monitor.expire_stale_tracks(frame_idx):
                    logger.warning(
                        "camera %s: track %s lost while inside barrier zone (no exit observed)",
                        self._camera.id,
                        stale_track_id,
                    )
        finally:
            cap.release()

    def _open_stream(self) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(self._camera.rtsp_url, cv2.CAP_FFMPEG)
        while not cap.isOpened() and not self._stop_event.is_set():
            logger.warning("camera %s: unable to open stream, retrying", self._camera.id)
            time.sleep(_RECONNECT_DELAY_SECONDS)
            cap = cv2.VideoCapture(self._camera.rtsp_url, cv2.CAP_FFMPEG)
        return cap

    def _handle_event(self, zone_event: ZoneEvent, frame) -> None:
        snapshot_path = self._snapshot_dir / (
            f"{self._camera.id}_{zone_event.track_id}_{zone_event.direction}_{int(time.time())}.jpg"
        )
        cv2.imwrite(str(snapshot_path), frame)

        event = BarrierEvent(
            camera_id=self._camera.id,
            track_id=zone_event.track_id,
            direction=zone_event.direction,
            dwell_frames=zone_event.dwell_frames,
            snapshot_path=str(snapshot_path),
        )
        self._event_store.record(event)
        logger.info(
            "camera %s: truck %s %s (dwell=%s frames)",
            self._camera.id,
            zone_event.track_id,
            zone_event.direction.upper(),
            zone_event.dwell_frames,
        )
