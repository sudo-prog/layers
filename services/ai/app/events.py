"""Event logging module for the LAYERS AI Service.

Provides a local-first, privacy-respecting event log stored as JSONL.
All events are anonymized: no raw user identifiers, no pixel data,
no image content — only feature vectors and stack metadata.

Stage 1.5/1.6 deliverables:
  * :class:`Event` and :class:`ConsentRecord` pydantic schemas
  * :class:`EventStore` — append/get/filter/purge on a JSONL file
  * Anonymisation via SHA-256 hashing with a fixed application salt
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Iterator

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Paths — mirrored to ./data/events/ (relative to project root)
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data", "events")

EVENTS_FILE_NAME = "events.jsonl"

# Application-level salt for user-id anonymisation.
# In a production deployment this would be sourced from a secrets manager;
# for v1 it is a fixed value stored alongside the codebase.
_ANON_SALT: str = "layers-anon-v1"

# Canonical set of permitted event types.
VALID_EVENT_TYPES: tuple[str, ...] = (
    "stack_created",
    "stack_applied",
    "stack_optimized",
    "stack_pruned",
    "preset_saved",
    "preset_applied",
    "photo_imported",
    "ai_search",
    "ai_optimize",
    "ai_prune",
)


def _default_data_dir() -> str:
    """Return the data directory, creating it if needed."""
    os.makedirs(DATA_DIR, exist_ok=True)
    return DATA_DIR


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class Event(BaseModel):
    """A single anonymized analytics event.

    Fields:
      user_id: anonymized SHA-256 hash of the raw user identifier.
      event_type: one of the permitted event-type values.
      timestamp: ISO-8601 UTC datetime string.
      session_id: opaque session identifier.
      metadata: arbitrary JSON-serializable dict of event context.
    """

    user_id: str = Field(..., description="Anonymized user identifier (SHA-256 hash).")

    @field_validator("user_id")
    @classmethod
    def _validate_user_id(cls, v: str) -> str:
        if not v or not isinstance(v, str):
            raise ValueError("user_id must be a non-empty string")
        # Require a 64-char hex SHA-256 hash to enforce anonymization at the
        # model boundary — raw identifiers must never enter the event log.
        if len(v) != 64:
            raise ValueError("user_id must be a 64-character SHA-256 hex hash")
        try:
            int(v, 16)
        except ValueError:
            raise ValueError("user_id must be a valid hexadecimal SHA-256 hash")
        return v

    event_type: str = Field(..., description="Type of event.")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO-8601 UTC timestamp.",
    )
    session_id: str = Field(..., description="Opaque session identifier.")
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Event-specific metadata."
    )

    @field_validator("event_type")
    @classmethod
    def _validate_event_type(cls, v: str) -> str:
        if v not in VALID_EVENT_TYPES:
            raise ValueError(
                f"event_type '{v}' is not valid; must be one of {VALID_EVENT_TYPES}"
            )
        return v


class ConsentRecord(BaseModel):
    """Persistent consent record for a single user.

    Fields:
      user_id: anonymized hash (same scheme as :class:`Event`).
      consent_given: whether consent is currently granted.
      consent_timestamp: ISO-8601 UTC timestamp of the last consent action.
      data_retention_days: number of days events are retained (default 30).
      opt_in_features: list of feature names the user has opted into.
    """

    user_id: str = Field(..., description="Anonymized user identifier (SHA-256 hash).")
    consent_given: bool = Field(..., description="Whether consent is granted.")
    consent_timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO-8601 UTC timestamp of last consent action.",
    )
    data_retention_days: int = Field(
        default=30, ge=1, description="Days to retain event data (minimum 1)."
    )
    opt_in_features: list[str] = Field(
        default_factory=list,
        description="Features the user has explicitly opted into.",
    )


# ---------------------------------------------------------------------------
# Privacy helpers
# ---------------------------------------------------------------------------

def anonymize_user_id(raw_id: str) -> str:
    """Return a SHA-256 hash of *raw_id* using the application salt.

    No raw identifiers are stored or logged.  Only the hash is kept so that
    events can be correlated to a pseudonymous identity without exposing the
    underlying value.
    """
    if not raw_id:
        raise ValueError("raw_id must be a non-empty string")
    salted = f"{_ANON_SALT}:{raw_id}"
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Event store
# ---------------------------------------------------------------------------

class EventStore:
    """JSONL-backed event store with anonymisation and retention purge.

    Events are written to ``events.jsonl`` inside ``./data/events/``.  Each
    line is a self-contained JSON object representing one :class:`Event`.
    """

    def __init__(self, filepath: str | None = None, data_dir: str | None = None) -> None:
        self.data_dir = data_dir or _default_data_dir()
        self.filepath = filepath or os.path.join(self.data_dir, EVENTS_FILE_NAME)
        os.makedirs(self.data_dir, exist_ok=True)
        # Touch the file so it exists even with no events.
        if not os.path.exists(self.filepath):
            with open(self.filepath, "a", encoding="utf-8"):
                pass

    # -- writing -----------------------------------------------------------

    def append(self, event: Event) -> None:
        """Append a single event as a new JSONL line."""
        record = event.model_dump()
        with open(self.filepath, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")

    # -- reading -----------------------------------------------------------

    def _iter_records(self) -> Iterator[dict[str, Any]]:
        """Yield each JSONL line as a dict (skipping blank/malformed lines)."""
        if not os.path.exists(self.filepath):
            return
        with open(self.filepath, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue

    def get_events(self, user_id: str, since: datetime | None = None) -> list[Event]:
        """Return events for *user_id* (anonymized hash) since *since*.

        If *since* is ``None`` all events for the user are returned.
        """
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("user_id must be a non-empty anonymized hash string")
        results: list[Event] = []
        since_ts = since.timestamp() if since else None
        for rec in self._iter_records():
            if rec.get("user_id") != user_id:
                continue
            if since_ts is not None:
                try:
                    ev_ts = self._parse_ts(rec.get("timestamp", ""))
                    if ev_ts is None or ev_ts < since_ts:
                        continue
                except (ValueError, TypeError):
                    continue
            try:
                results.append(Event(**rec))
            except Exception:
                continue
        return results

    def get_all_events(self) -> list[Event]:
        """Return every event in the store."""
        results: list[Event] = []
        for rec in self._iter_records():
            try:
                results.append(Event(**rec))
            except Exception:
                continue
        return results

    def get_events_by_type(
        self, event_type: str, user_id: str | None = None
    ) -> list[Event]:
        """Filter events by type, optionally scoped to a user."""
        if event_type not in VALID_EVENT_TYPES:
            raise ValueError(
                f"Invalid event_type '{event_type}'; must be one of {VALID_EVENT_TYPES}"
            )
        results: list[Event] = []
        for rec in self._iter_records():
            if rec.get("event_type") != event_type:
                continue
            if user_id is not None and rec.get("user_id") != user_id:
                continue
            try:
                results.append(Event(**rec))
            except Exception:
                continue
        return results

    # -- maintenance -------------------------------------------------------

    @staticmethod
    def _parse_ts(ts: str) -> float | None:
        """Parse an ISO-8601 timestamp to posix seconds (or None)."""
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts).timestamp()
        except (ValueError, TypeError):
            return None

    def purge_expired(
        self, retention_days: int = 30, now: float | None = None
    ) -> int:
        """Remove events older than *retention_days* from the store.

        Returns the number of events retained (i.e. kept).
        """
        cutoff = (now if now is not None else time.time()) - (retention_days * 86400)
        kept: list[str] = []
        for rec in self._iter_records():
            ts = self._parse_ts(rec.get("timestamp", ""))
            if ts is not None and ts < cutoff:
                continue  # expired — drop
            kept.append(json.dumps(rec))
        with open(self.filepath, "w", encoding="utf-8") as fh:
            for line in kept:
                fh.write(line + "\n")
        return len(kept)


# ---------------------------------------------------------------------------
# Module-level convenience instance
# ---------------------------------------------------------------------------

default_store = EventStore()
