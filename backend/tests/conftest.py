import base64
import json
import os
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

TEST_TOTP_KEY = base64.urlsafe_b64encode(b"k" * 32).decode("ascii")
os.environ.setdefault("TOTP_ENCRYPTION_ACTIVE_KEY_ID", "test-key")
os.environ.setdefault(
    "TOTP_ENCRYPTION_KEYS_JSON",
    json.dumps({"test-key": TEST_TOTP_KEY}),
)
