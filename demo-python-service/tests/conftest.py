"""Make the service root importable (app, patterns.*) regardless of how pytest
is invoked — `python -m pytest tests/` from the service dir already works via
CWD; this keeps it working from anywhere."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
