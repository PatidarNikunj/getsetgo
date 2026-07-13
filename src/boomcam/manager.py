"""Spins up one CameraWorker per configured camera and manages their lifecycle."""
from __future__ import annotations

import logging
from typing import List

from .camera_worker import CameraWorker
from .config import AppConfig
from .detector import TruckDetector
from .events import EventStore

logger = logging.getLogger(__name__)


class CameraFleetManager:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._event_store = EventStore(config.storage.db_path)
        self._workers: List[CameraWorker] = []

    def start(self) -> None:
        for camera in self._config.cameras:
            detector = TruckDetector(
                model_weights=self._config.detection.model_weights,
                confidence=self._config.detection.confidence,
                device=self._config.detection.device,
                classes=self._config.detection.classes,
            )
            worker = CameraWorker(camera, detector, self._event_store, self._config.storage)
            self._workers.append(worker)
            worker.start()
            logger.info("started worker for camera %s (%s)", camera.id, camera.name)

    def stop(self) -> None:
        for worker in self._workers:
            worker.stop()
        for worker in self._workers:
            worker.join(timeout=10)
        self._event_store.close()
