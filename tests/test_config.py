import pytest

from boomcam.config import load_config


def test_load_config_parses_cameras_and_expands_env_vars(tmp_path, monkeypatch):
    monkeypatch.setenv("CAM_USER", "admin")
    monkeypatch.setenv("CAM_PASS", "secret")

    config_file = tmp_path / "cameras.yaml"
    config_file.write_text(
        """
detection:
  model_weights: yolov8n.pt
  confidence: 0.5
  device: cpu
  classes: [truck, bus]

storage:
  db_path: data/events.db
  snapshot_dir: data/snapshots

cameras:
  - id: gate-1
    name: "Gate 1"
    rtsp_url: "rtsp://${CAM_USER}:${CAM_PASS}@10.0.0.1:554/stream"
    zone: [[0, 0], [10, 0], [10, 10], [0, 10]]
    inside_direction: [0, 1]
"""
    )

    config = load_config(config_file)

    assert len(config.cameras) == 1
    camera = config.cameras[0]
    assert camera.rtsp_url == "rtsp://admin:secret@10.0.0.1:554/stream"
    assert camera.zone == [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert camera.min_dwell_frames == 3  # default
    assert config.detection.classes == ["truck", "bus"]


def test_load_config_requires_at_least_one_camera(tmp_path):
    config_file = tmp_path / "cameras.yaml"
    config_file.write_text("cameras: []\n")

    with pytest.raises(ValueError):
        load_config(config_file)
