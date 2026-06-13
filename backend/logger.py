"""
logger.py — JSON Prediction Logger for CRS (v2.0)
─────────────────────────────────────────────────
Appends every prediction to logs/predictions.json.
The file is created automatically if it does not exist.
Data is preserved across restarts (no overwriting).
Stored entries are used for future model retraining.
"""

import os
import json
from datetime import datetime

# ── Path to the log file ─────────────────────────────────────
# Resolves to  <project_root>/logs/predictions.json
# regardless of where Flask is started from.
_BASE_DIR = os.path.join(os.path.dirname(__file__), '..')
LOG_DIR   = os.path.join(_BASE_DIR, 'logs')
LOG_FILE  = os.path.join(LOG_DIR,  'predictions.json')


def _ensure_log_file():
    """
    Create logs/ directory and an empty JSON array file
    if they do not already exist.
    """
    os.makedirs(LOG_DIR, exist_ok=True)

    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, 'w') as f:
            json.dump([], f)
        print(f"  [Logger] Created new log file: {LOG_FILE}")


def log_prediction(device_id: str, inputs: dict, predictions: list,
                   inference_time_ms: float):
    """
    Append one prediction record to logs/predictions.json.

    Parameters
    ----------
    device_id         : ESP8266 device identifier string
    inputs            : dict of all model input values
    predictions       : list of top-3 crop dicts from predict_top3_crops()
    inference_time_ms : total inference duration in milliseconds
    """
    try:
        _ensure_log_file()

        # Build the log entry
        entry = {
            "timestamp":        datetime.now().isoformat(),
            "device_id":        device_id,
            "inputs":           inputs,
            "predictions":      predictions,
            "inference_time_ms": inference_time_ms,
        }

        # Read existing entries
        with open(LOG_FILE, 'r') as f:
            try:
                logs = json.load(f)
            except json.JSONDecodeError:
                # File was corrupted — start fresh
                logs = []

        # Append new entry
        logs.append(entry)

        # Write back (pretty-printed for readability)
        with open(LOG_FILE, 'w') as f:
            json.dump(logs, f, indent=2, default=str)

        print(f"  [Logger] Entry #{len(logs)} saved  "
              f"({inference_time_ms} ms)  → {LOG_FILE}")

    except Exception as e:
        # Logging must never crash the server
        print(f"  [Logger] WARNING — failed to write log: {e}")


def get_log_count() -> int:
    """Return the number of prediction entries in the log file."""
    try:
        _ensure_log_file()
        with open(LOG_FILE, 'r') as f:
            logs = json.load(f)
        return len(logs)
    except Exception:
        return 0
