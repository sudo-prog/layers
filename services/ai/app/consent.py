"""Consent management module for the LAYERS AI Service.

Provides a local-first, privacy-respecting consent layer stored as JSON
in ``./data/consent/``.

Privacy rules enforced:
  * No pixels leave the device without explicit opt-in.
  * No stack images or raw image content are ever logged.
  * Only anonymized feature vectors and stack metadata are recorded.
  * Raw user identifiers are never stored — only SHA-256 hashes.

Stage 1.5/1.6 deliverables:
  * :class:`ConsentStore` — give / revoke / check / status
  * :class:`PrivacyRules` — static privacy policy constants
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError

from app.events import (
    ConsentRecord,
    anonymize_user_id,
)


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
CONSENT_DIR = os.path.join(PROJECT_ROOT, "data", "consent")
CONSENT_FILE_NAME = "consents.json"

os.makedirs(CONSENT_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Privacy rules (static, machine-readable)
# ---------------------------------------------------------------------------

class PrivacyRules:
    """Static declaration of the privacy rules enforced by the consent layer.

    These are surfaced to the FE (Stage 1.5) so the UI can render the
    consent prompt accurately.
    """

    NO_PIXELS_WITHOUT_OPT_IN: str = (
        "No pixel data (raw image content) leaves the device unless the "
        "user has explicitly opted into the 'pixel_uploads' feature."
    )
    NO_STACK_IMAGES_LOGGED: str = (
        "Stack images and rendered previews are never logged or stored "
        "in the event log. Only anonymized feature vectors and stack "
        "metadata (layer names, parameter ranges, blend modes) are recorded."
    )
    NO_RAW_USER_IDS: str = (
        "Raw user identifiers are never stored. Events and consent records "
        "use SHA-256 hashes of the user ID with an application salt "
        "sourced from the LAYERS_ANON_SALT environment variable."
    )
    ONLY_FEATURE_VECTORS_AND_METADATA: str = (
        "The event log contains only anonymized feature vectors and stack "
        "metadata — no image content, no pixel data, no personally "
        "identifying information."
    )
    DEFAULT_RETENTION_DAYS: int = 30
    ALLOWED_OPT_IN_FEATURES: tuple[str, ...] = (
        "ai_search",
        "ai_optimize",
        "pixel_uploads",
    )

    @classmethod
    def all(cls) -> list[str]:
        """Return all privacy rule statements as a list of strings."""
        return [
            cls.NO_PIXELS_WITHOUT_OPT_IN,
            cls.NO_STACK_IMAGES_LOGGED,
            cls.NO_RAW_USER_IDS,
            cls.ONLY_FEATURE_VECTORS_AND_METADATA,
        ]


# ---------------------------------------------------------------------------
# Consent store
# ---------------------------------------------------------------------------

class ConsentStore:
    """JSON-file-backed consent store for per-user consent records.

    Each record is keyed by the anonymized user hash.  The store supports:
      * ``give_consent``  — opt-in to one or more features
      * ``revoke_consent`` — opt-out (clears all features)
      * ``check_consent`` — test whether a feature is opted-in
      * ``get_consent_status`` — full record retrieval
      * ``purge_expired`` — remove consent records with no activity
                             beyond the retention window
    """

    def __init__(self, filepath: str | None = None, data_dir: str | None = None) -> None:
        self.data_dir = data_dir or CONSENT_DIR
        self.filepath = filepath or os.path.join(self.data_dir, CONSENT_FILE_NAME)
        os.makedirs(self.data_dir, exist_ok=True)
        if not os.path.exists(self.filepath):
            self._write({})

    # -- internal helpers --------------------------------------------------

    def _read(self) -> dict[str, dict[str, Any]]:
        """Read the consent store from disk."""
        try:
            with open(self.filepath, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if not isinstance(data, dict):
                return {}
            return data
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def _write(self, data: dict[str, dict[str, Any]]) -> None:
        """Write the consent store to disk atomically."""
        tmp_path = self.filepath + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
        os.replace(tmp_path, self.filepath)

    @staticmethod
    def _is_valid_hash(uid: str) -> bool:
        """Check that *uid* looks like a 64-char hex SHA-256 hash."""
        if not isinstance(uid, str) or len(uid) != 64:
            return False
        try:
            int(uid, 16)
            return True
        except ValueError:
            return False

    # -- public API --------------------------------------------------------

    def give_consent(self, user_id: str, features: list[str] | None = None) -> ConsentRecord:
        """Record explicit consent for *user_id*.

        Args:
            user_id: raw user identifier (will be anonymized before storage).
            features: optional list of feature names to opt into.  Must be
                      a subset of :attr:`PrivacyRules.ALLOWED_OPT_IN_FEATURES`.

        Returns:
            The persisted :class:`ConsentRecord`.
        """
        if not user_id:
            raise ValueError("user_id must be a non-empty string")
        features = features or []
        for feat in features:
            if feat not in PrivacyRules.ALLOWED_OPT_IN_FEATURES:
                raise ValueError(
                    f"Unknown opt-in feature '{feat}'; "
                    f"allowed: {PrivacyRules.ALLOWED_OPT_IN_FEATURES}"
                )
        anon_id = anonymize_user_id(user_id)
        record = ConsentRecord(
            user_id=anon_id,
            consent_given=True,
            consent_timestamp=datetime.now(timezone.utc).isoformat(),
            opt_in_features=list(features),
        )
        data = self._read()
        data[anon_id] = record.model_dump()
        self._write(data)
        return record

    def revoke_consent(self, user_id: str) -> bool:
        """Revoke all consent for *user_id*.

        Returns ``True`` if a record was found and removed (or updated),
        ``False`` if no record existed.
        """
        if not user_id:
            raise ValueError("user_id must be a non-empty string")
        anon_id = anonymize_user_id(user_id)
        data = self._read()
        if anon_id not in data:
            return False
        # Mark consent as revoked but keep the record for auditability.
        record = ConsentRecord(
            user_id=anon_id,
            consent_given=False,
            consent_timestamp=datetime.now(timezone.utc).isoformat(),
            opt_in_features=[],
        )
        data[anon_id] = record.model_dump()
        self._write(data)
        return True

    def check_consent(self, user_id: str, feature: str) -> bool:
        """Return ``True`` if *user_id* has opted into *feature*.

        If no consent record exists the result is ``False``.
        """
        if not user_id:
            raise ValueError("user_id must be a non-empty string")
        if not feature:
            raise ValueError("feature must be a non-empty string")
        # If the raw user_id was passed, anonymize it; if an already-hashed
        # value was passed (64-char hex), use it directly.
        anon_id = user_id if self._is_valid_hash(user_id) else anonymize_user_id(user_id)
        data = self._read()
        record = data.get(anon_id)
        if record is None:
            return False
        return bool(record.get("consent_given", False)) and (
            feature in record.get("opt_in_features", [])
        )

    def get_consent_status(self, user_id: str) -> ConsentRecord | None:
        """Return the full :class:`ConsentRecord` for *user_id*, or ``None``."""
        if not user_id:
            raise ValueError("user_id must be a non-empty string")
        anon_id = user_id if self._is_valid_hash(user_id) else anonymize_user_id(user_id)
        data = self._read()
        record = data.get(anon_id)
        if record is None:
            return None
        try:
            return ConsentRecord(**record)
        except ValidationError:
            return None

    def get_all_consent_records(self) -> list[ConsentRecord]:
        """Return all consent records (useful for auditing)."""
        data = self._read()
        records: list[ConsentRecord] = []
        for rec in data.values():
            try:
                records.append(ConsentRecord(**rec))
            except ValidationError:
                continue
        return records

    def purge_expired(self) -> int:
        """Remove consent records whose last action predates the retention window.

        Uses each record's ``data_retention_days`` to compute the cutoff.
        Returns the number of records remaining.
        """
        import time as _time

        now = _time.time()
        data = self._read()
        kept: dict[str, dict[str, Any]] = {}
        for uid, rec in data.items():
            try:
                record = ConsentRecord(**rec)
            except ValidationError:
                continue
            ts = self._parse_ts(record.consent_timestamp)
            if ts is None:
                continue  # unparseable — keep for safety
            cutoff = now - (record.data_retention_days * 86400)
            if ts >= cutoff:
                kept[uid] = record.model_dump()
        self._write(kept)
        return len(kept)

    @staticmethod
    def _parse_ts(ts: str) -> float | None:
        """Parse an ISO-8601 timestamp to posix seconds (or None)."""
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts).timestamp()
        except (ValueError, TypeError):
            return None


# ---------------------------------------------------------------------------
# Module-level convenience instance
# ---------------------------------------------------------------------------

default_consent_store = ConsentStore()
