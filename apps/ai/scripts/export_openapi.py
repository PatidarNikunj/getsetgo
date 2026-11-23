"""Write the FastAPI OpenAPI schema to openapi.json (the typed contract apps/api consumes)."""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Importing the app needs settings; placeholders are fine because nothing connects at import time.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")
os.environ.setdefault("SERVICE_JWT_SECRET", "x" * 32)
os.environ["ENVIRONMENT"] = "development"

from app.main import app  # noqa: E402  (env vars must be set before importing)

out = ROOT / "openapi.json"
out.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
print(f"Wrote {out}")
