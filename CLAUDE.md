# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`boomcam` — a Python service that watches live RTSP surveillance camera
feeds, detects and tracks trucks with YOLOv8, and classifies each truck's
crossing of a configured zone around a boom barrier as an **entry** or
**exit**. Events are logged and persisted to a local SQLite store with a
snapshot image. See `README.md` for setup, configuration, and usage.

## Commands

```bash
pip install -e ".[dev]"     # install package + dev deps (pytest)
pytest                      # run tests
boomcam --config config/cameras.yaml   # run the service
pytest tests/test_geometry.py::test_monitor_emits_entry_when_moving_along_inside_direction  # single test
```

`ultralytics` and `opencv-python-headless` are real dependencies of the
package but are only exercised by `detector.py` and `camera_worker.py`;
`tests/test_geometry.py`, `test_config.py`, and `test_events.py` run without
them, a GPU, or a real camera.

## Architecture

Source lives under `src/boomcam/` (src-layout package, see `pyproject.toml`).
The pipeline, per camera, is:

```
RTSP stream --(cv2.VideoCapture)--> CameraWorker --(TruckDetector.track)--> Detection(s)
                                                        |
                                                        v
                                          BarrierZoneMonitor.update(track_id, centroid, frame)
                                                        |
                                              ZoneEvent("entry"|"exit") or None
                                                        |
                                                        v
                                          EventStore.record(...) + snapshot .jpg
```

- **`config.py`** — loads `AppConfig`/`CameraConfig`/`DetectionConfig`/`StorageConfig`
  from a YAML file. Each camera declares an RTSP URL (credentials expanded
  from env vars via `os.path.expandvars`, never committed), a `zone` polygon
  in that camera's pixel space, and an `inside_direction` vector used to
  classify crossings.
- **`geometry.py`** — the core, dependency-free detection logic:
  `BarrierZoneMonitor` is a per-camera state machine keyed by track id. A
  truck must dwell inside the `zone` polygon for `min_dwell_frames` and then
  leave it before a crossing is classified; direction is the dot product of
  the truck's net movement against `inside_direction`. This is the module to
  read first to understand the entry/exit logic, and the one with the most
  test coverage.
- **`detector.py`** — wraps a YOLOv8 model (`ultralytics.YOLO`) with
  persistent tracking, filtered to configured vehicle classes (`truck` by
  default; `car`/`bus` also supported via COCO class ids). **Each camera
  gets its own `TruckDetector`/model instance** — the ultralytics tracker
  keeps state on the model object, so it isn't safe to share across
  concurrent streams. This is the main scaling constraint for large camera
  fleets (see README "Known limitations").
- **`camera_worker.py`** — `CameraWorker` is a `threading.Thread` per camera:
  reads frames via `cv2.VideoCapture` (with reconnect-with-backoff on stream
  loss), runs the detector, feeds centroids into the zone monitor, and on a
  `ZoneEvent` writes a snapshot + a `BarrierEvent` to the store.
- **`manager.py`** — `CameraFleetManager` owns the single shared
  `EventStore` and starts/stops one `CameraWorker` per configured camera.
- **`events.py`** — `BarrierEvent` dataclass + thread-safe `EventStore`
  (SQLite, `check_same_thread=False` + a lock, since multiple camera
  threads write concurrently).
- **`cli.py`** — `boomcam --config <path>` entry point; loads config, starts
  the manager, blocks on a `threading.Event` until SIGINT/SIGTERM, then
  stops workers gracefully.

`config/cameras.example.yaml` documents the config schema with comments.

## Conventions

- Pure-logic modules (`geometry.py`, `config.py`, `events.py`) intentionally
  avoid importing `cv2`/`ultralytics` so their tests run fast without those
  heavy, hardware-dependent dependencies. Keep new camera/vision-dependent
  code in `detector.py`/`camera_worker.py` rather than pulling those imports
  into the logic modules.
- New detection classes must be added to `_COCO_CLASS_IDS` in `detector.py`
  before they can be referenced in a camera config's `detection.classes`.
