# getsetgo

Truck entry/exit detection at boom barriers from live RTSP surveillance camera feeds.

## What it does

`boomcam` watches one or more RTSP camera streams, detects and tracks trucks
in each frame with YOLOv8, and classifies each truck's crossing of a
configured "zone" around the boom barrier as an **entry** or **exit** based
on the direction it moved while dwelling in that zone. Each event is logged
and written to a local SQLite store along with a snapshot image.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Configuring cameras

Copy `config/cameras.example.yaml` and fill in your cameras. For each camera
you need:

- `rtsp_url` — the stream URL. Reference credentials via environment
  variables (e.g. `${GATE1_CAM_PASS}`) rather than committing them.
- `zone` — a polygon (pixel coordinates in that camera's frame) tightly
  bounding the boom barrier's swept area.
- `inside_direction` — a vector, in the same pixel coordinate space as
  `zone`, pointing from outside the facility toward the inside. A truck that
  dwells in the zone and then leaves moving with this vector is classified
  as an entry; moving against it is an exit.

## Running

```bash
boomcam --config config/cameras.yaml
```

Events are written to `data/events.db` (SQLite) and snapshots to
`data/snapshots/` by default (configurable under `storage:` in the YAML
config). Stop with Ctrl+C / SIGTERM for a graceful shutdown.

## Running tests

```bash
pytest
```

The geometry, config, and event-store tests run without a GPU, camera, or
model weights. Exercising `detector.py` / `camera_worker.py` end-to-end
requires `ultralytics` + `opencv-python-headless` installed and an actual
RTSP feed.

## Known limitations

- Each camera worker loads its own YOLO model instance (ultralytics'
  persistent tracker keeps state on the model object, so it isn't safe to
  share across concurrent streams). This is simple and correct but scales
  linearly in memory/compute with the number of cameras — batching frames
  across cameras through a shared model would be a follow-up optimization
  for large deployments.
- A track that is lost (e.g. due to occlusion) while inside the zone is
  logged as a warning but does not produce an entry/exit event, since its
  exit direction can't be determined.
