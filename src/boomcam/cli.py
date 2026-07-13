"""Entry point: `boomcam --config path/to/cameras.yaml`."""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
from typing import List, Optional

from .config import load_config
from .manager import CameraFleetManager


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="path to cameras YAML config")
    args = parser.parse_args(argv)

    _configure_logging()
    config = load_config(args.config)
    manager = CameraFleetManager(config)
    manager.start()

    stop_event = threading.Event()

    def _handle_signal(signum, frame) -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    stop_event.wait()
    manager.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
