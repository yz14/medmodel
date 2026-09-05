"""Dump FastAPI OpenAPI schema for frontend type generation."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Ensure backend package is importable when run as script
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import create_app  # noqa: E402


def main() -> None:
    app = create_app()
    schema = app.openapi()
    out = Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"
    out.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()

