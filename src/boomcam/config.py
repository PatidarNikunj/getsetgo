"""YAML-driven configuration for cameras, detection, and storage settings."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Tuple, Union

import yaml

Point = Tuple[float, float]


@dataclass
class CameraConfig:
    id: str
    name: str
    rtsp_url: str
    zone: List[Point]
    inside_direction: Point
    min_dwell_frames: int = 3
    track_timeout_frames: int = 150


@dataclass
class DetectionConfig:
    model_weights: str = "yolov8n.pt"
    confidence: float = 0.4
    device: str = "cpu"
    classes: List[str] = field(default_factory=lambda: ["truck"])


@dataclass
class StorageConfig:
    db_path: str = "data/events.db"
    snapshot_dir: str = "data/snapshots"


@dataclass
class AppConfig:
    cameras: List[CameraConfig]
    detection: DetectionConfig
    storage: StorageConfig


def load_config(path: Union[str, Path]) -> AppConfig:
    """Load and validate an AppConfig from a YAML file.

    RTSP URLs are passed through os.path.expandvars so credentials can be
    injected via environment variables (e.g. ${GATE1_CAM_PASS}) instead of
    being committed to the config file.
    """
    raw = yaml.safe_load(Path(path).read_text())

    cameras = [
        CameraConfig(
            id=cam["id"],
            name=cam.get("name", cam["id"]),
            rtsp_url=os.path.expandvars(cam["rtsp_url"]),
            zone=[tuple(point) for point in cam["zone"]],
            inside_direction=tuple(cam["inside_direction"]),
            min_dwell_frames=cam.get("min_dwell_frames", 3),
            track_timeout_frames=cam.get("track_timeout_frames", 150),
        )
        for cam in raw.get("cameras", [])
    ]
    if not cameras:
        raise ValueError(f"no cameras defined in config file {path}")

    detection_raw = raw.get("detection", {})
    detection = DetectionConfig(
        model_weights=detection_raw.get("model_weights", "yolov8n.pt"),
        confidence=detection_raw.get("confidence", 0.4),
        device=detection_raw.get("device", "cpu"),
        classes=detection_raw.get("classes", ["truck"]),
    )

    storage_raw = raw.get("storage", {})
    storage = StorageConfig(
        db_path=storage_raw.get("db_path", "data/events.db"),
        snapshot_dir=storage_raw.get("snapshot_dir", "data/snapshots"),
    )

    return AppConfig(cameras=cameras, detection=detection, storage=storage)
