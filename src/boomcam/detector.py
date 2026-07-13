"""YOLOv8-based truck detector/tracker wrapper.

Each camera worker owns its own TruckDetector instance (and therefore its own
YOLO model + tracker state) since ultralytics' persistent tracker keeps state
on the model object and isn't safe to share across concurrent streams.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
from ultralytics import YOLO

# COCO class ids for the vehicle types we can detect.
_COCO_CLASS_IDS = {
    "car": 2,
    "bus": 5,
    "truck": 7,
}


@dataclass
class Detection:
    track_id: int
    class_name: str
    confidence: float
    centroid: Tuple[float, float]
    bbox: Tuple[float, float, float, float]


class TruckDetector:
    """Wraps a YOLOv8 model with persistent tracking enabled, filtered to the
    configured vehicle classes (trucks by default).
    """

    def __init__(self, model_weights: str, confidence: float, device: str, classes: List[str]) -> None:
        unknown = set(classes) - set(_COCO_CLASS_IDS)
        if unknown:
            raise ValueError(f"unsupported detection classes: {sorted(unknown)}")
        self._model = YOLO(model_weights)
        self._confidence = confidence
        self._device = device
        self._class_ids = [_COCO_CLASS_IDS[name] for name in classes]
        self._id_to_name = {v: k for k, v in _COCO_CLASS_IDS.items()}

    def track(self, frame: np.ndarray) -> List[Detection]:
        results = self._model.track(
            frame,
            persist=True,
            classes=self._class_ids,
            conf=self._confidence,
            device=self._device,
            verbose=False,
        )
        detections: List[Detection] = []
        if not results or results[0].boxes is None or results[0].boxes.id is None:
            return detections

        boxes = results[0].boxes
        for box, track_id, cls_id, conf in zip(
            boxes.xyxy.tolist(), boxes.id.tolist(), boxes.cls.tolist(), boxes.conf.tolist()
        ):
            x1, y1, x2, y2 = box
            centroid = ((x1 + x2) / 2, (y1 + y2) / 2)
            detections.append(
                Detection(
                    track_id=int(track_id),
                    class_name=self._id_to_name[int(cls_id)],
                    confidence=float(conf),
                    centroid=centroid,
                    bbox=(x1, y1, x2, y2),
                )
            )
        return detections
