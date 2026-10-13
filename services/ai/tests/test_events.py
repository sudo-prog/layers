"""Unit tests for the event logging and consent management modules.

Covers:
  * Event creation and anonymisation
  * Consent give / revoke / check
  * Raw user IDs are never stored
  * Data retention purge
  * Event types are valid
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone

import pytest

from app.events import (
    Event,
    EventStore,
    anonymize_user_id,
    VALID_EVENT_TYPES,
)
from app.consent import ConsentStore, ConsentRecord, PrivacyRules


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_event_store(tmp_path) -> EventStore:
    """A fresh EventStore backed by a temp directory."""
    data_dir = str(tmp_path / "events")
    return EventStore(data_dir=data_dir)


@pytest.fixture
def tmp_consent_store(tmp_path) -> ConsentStore:
    """A fresh ConsentStore backed by a temp directory."""
    data_dir = str(tmp_path / "consent")
    return ConsentStore(data_dir=data_dir)


@pytest.fixture
def raw_user_id() -> str:
    return "user@example.com"


@pytest.fixture
def anon_user_id(raw_user_id: str) -> str:
    return anonymize_user_id(raw_user_id)


# ---------------------------------------------------------------------------
# Anonymisation tests
# ---------------------------------------------------------------------------

class TestAnonymization:
    """Tests for anonymize_user_id()."""

    def test_anonymize_produces_sha256_hash(self, raw_user_id: str, anon_user_id: str):
        """anonymize_user_id should return a 64-char hex SHA-256 hash."""
        assert len(anon_user_id) == 64
        int(anon_user_id, 16)  # raises ValueError if not hex

    def test_anonymize_is_deterministic(self, raw_user_id: str):
        """Same input should always produce the same hash."""
        assert anonymize_user_id(raw_user_id) == anonymize_user_id(raw_user_id)

    def test_anonymize_differs_from_raw(self, raw_user_id: str, anon_user_id: str):
        """The hash must not equal the raw ID."""
        assert anon_user_id != raw_user_id
        assert raw_user_id not in anon_user_id

    def test_anonymize_different_inputs_different_hashes(self):
        """Different raw IDs should produce different hashes."""
        h1 = anonymize_user_id("alice")
        h2 = anonymize_user_id("bob")
        assert h1 != h2

    def test_anonymize_rejects_empty(self):
        """Empty user ID should raise ValueError."""
        with pytest.raises(ValueError, match="non-empty"):
            anonymize_user_id("")

    def test_anonymize_rejects_none(self):
        """None user ID should raise (TypeError from None.encode)."""
        with pytest.raises((ValueError, AttributeError, TypeError)):
            anonymize_user_id(None)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Event creation tests
# ---------------------------------------------------------------------------

class TestEventCreation:
    """Tests for Event model construction."""

    def test_event_requires_anonymized_user_id(self, anon_user_id: str):
        """Event should accept an anonymized hash."""
        event = Event(
            user_id=anon_user_id,
            event_type="stack_created",
            session_id="sess-123",
        )
        assert event.user_id == anon_user_id

    def test_event_timestamp_defaults_to_now(self, anon_user_id: str):
        """Event.timestamp should default to current UTC time in ISO format."""
        before = datetime.now(timezone.utc)
        event = Event(
            user_id=anon_user_id,
            event_type="stack_applied",
            session_id="sess-1",
        )
        after = datetime.now(timezone.utc)
        parsed = datetime.fromisoformat(event.timestamp)
        assert before <= parsed <= after

    def test_event_metadata_defaults_to_empty_dict(self, anon_user_id: str):
        """Event.metadata should default to an empty dict."""
        event = Event(
            user_id=anon_user_id,
            event_type="photo_imported",
            session_id="sess-1",
        )
        assert event.metadata == {}

    def test_event_accepts_custom_metadata(self, anon_user_id: str):
        """Event.metadata should accept arbitrary JSON-serializable content."""
        event = Event(
            user_id=anon_user_id,
            event_type="ai_search",
            session_id="sess-1",
            metadata={"query": "sunset", "results_count": 3, "tags": ["landscape", "warm"]},
        )
        assert event.metadata["query"] == "sunset"
        assert event.metadata["results_count"] == 3

    def test_event_rejects_invalid_event_type(self, anon_user_id: str):
        """Event should reject an event_type not in the allowed set."""
        with pytest.raises(ValueError, match="not valid"):
            Event(
                user_id=anon_user_id,
                event_type="invalid_event",
                session_id="sess-1",
            )

    def test_event_rejects_empty_user_id(self):
        """Event should reject an empty user_id."""
        with pytest.raises(ValueError):
            Event(user_id="", event_type="stack_created", session_id="s1")


# ---------------------------------------------------------------------------
# Event types validation
# ---------------------------------------------------------------------------

class TestEventTypes:
    """Tests for event-type validation."""

    EXPECTED_TYPES = {
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
    }

    def test_valid_event_types_constant_matches_spec(self):
        """VALID_EVENT_TYPES should match the spec exactly."""
        assert set(VALID_EVENT_TYPES) == self.EXPECTED_TYPES

    @pytest.mark.parametrize("etype", sorted(VALID_EVENT_TYPES))
    def test_each_event_type_creates_valid_event(self, anon_user_id: str, etype: str):
        """Each valid event type should produce a valid Event."""
        event = Event(
            user_id=anon_user_id,
            event_type=etype,
            session_id="sess-1",
        )
        assert event.event_type == etype

    def test_append_store_rejects_invalid_type(self, tmp_event_store: EventStore, anon_user_id: str):
        """EventStore.append should propagate the validator's error."""
        with pytest.raises(ValueError):
            tmp_event_store.append(
                Event(
                    user_id=anon_user_id,
                    event_type="bogus_event",
                    session_id="s1",
                )
            )


# ---------------------------------------------------------------------------
# EventStore append / get tests
# ---------------------------------------------------------------------------

class TestEventStore:
    """Tests for EventStore append / retrieval."""

    def test_append_writes_jsonl_line(self, tmp_event_store: EventStore, anon_user_id: str):
        """append() should write one JSONL line per event."""
        event = Event(
            user_id=anon_user_id,
            event_type="stack_created",
            session_id="sess-1",
            metadata={"stack_id": "abc", "layers": 3},
        )
        tmp_event_store.append(event)
        assert os.path.exists(tmp_event_store.filepath)
        with open(tmp_event_store.filepath, encoding="utf-8") as fh:
            lines = fh.readlines()
        assert len(lines) == 1
        rec = json.loads(lines[0])
        assert rec["user_id"] == anon_user_id
        assert rec["event_type"] == "stack_created"

    def test_get_events_returns_only_user_events(self, tmp_event_store: EventStore):
        """get_events() should filter by user_id (anonymized hash)."""
        user_a = anonymize_user_id("alice")
        user_b = anonymize_user_id("bob")
        for uid in (user_a, user_b):
            tmp_event_store.append(
                Event(user_id=uid, event_type="stack_created", session_id="s1")
            )
        events_b = tmp_event_store.get_events(user_b)
        assert len(events_b) == 1
        assert events_b[0].user_id == user_b

    def test_get_all_events(self, tmp_event_store: EventStore, anon_user_id: str):
        """get_all_events() should return every event."""
        for i in range(5):
            tmp_event_store.append(
                Event(
                    user_id=anon_user_id,
                    event_type="stack_created",
                    session_id=f"s{i}",
                )
            )
        all_events = tmp_event_store.get_all_events()
        assert len(all_events) == 5

    def test_get_events_since_filters_timestamp(self, tmp_event_store: EventStore, anon_user_id: str):
        """get_events(since=...) should only return events after the cutoff."""
        # Write one event, sleep briefly, then write a second.
        tmp_event_store.append(
            Event(user_id=anon_user_id, event_type="stack_created", session_id="old")
        )
        time.sleep(0.05)
        cutoff = datetime.now(timezone.utc)
        time.sleep(0.05)
        tmp_event_store.append(
            Event(user_id=anon_user_id, event_type="stack_created", session_id="new")
        )
        recent = tmp_event_store.get_events(anon_user_id, since=cutoff)
        assert len(recent) == 1
        assert recent[0].session_id == "new"

    def test_get_events_empty_user(self, tmp_event_store: EventStore, anon_user_id: str):
        """get_events() with no matching events returns empty list."""
        other = anonymize_user_id("nobody")
        assert tmp_event_store.get_events(other) == []

    def test_get_events_rejects_empty_user_id(self, tmp_event_store: EventStore):
        """get_events('') should raise ValueError."""
        with pytest.raises(ValueError):
            tmp_event_store.get_events("")


# ---------------------------------------------------------------------------
# Privacy: no raw user IDs stored
# ---------------------------------------------------------------------------

class TestPrivacyNoRawUserIds:
    """Verify that raw user IDs never appear in the event log."""

    def test_raw_id_not_in_log_file(self, tmp_event_store: EventStore, raw_user_id: str):
        """The raw user ID string must not appear in the JSONL file."""
        event = Event(
            user_id=anonymize_user_id(raw_user_id),
            event_type="stack_created",
            session_id="s1",
        )
        tmp_event_store.append(event)
        raw_text = open(tmp_event_store.filepath, encoding="utf-8").read()
        assert raw_user_id not in raw_text

    def test_raw_email_not_in_user_id_field(self, tmp_event_store: EventStore, raw_user_id: str):
        """The raw user ID must not appear in the user_id field of any stored event."""
        anon = anonymize_user_id(raw_user_id)
        event = Event(
            user_id=anon,
            event_type="ai_search",
            session_id="s1",
            metadata={"query": "test", "source": "user-input"},
        )
        tmp_event_store.append(event)
        raw_text = open(tmp_event_store.filepath, encoding="utf-8").read()
        # The user_id in the stored JSON must be the hash, not the raw email.
        stored = json.loads(raw_text.strip())
        assert stored["user_id"] == anon
        assert stored["user_id"] != raw_user_id
        assert raw_user_id not in stored["user_id"]

    def test_event_rejects_raw_user_id_at_model_layer(self, raw_user_id: str):
        """Event model should reject a raw (non-hashed) user_id string."""
        with pytest.raises(ValueError, match="SHA-256"):
            Event(
                user_id=raw_user_id,
                event_type="ai_search",
                session_id="s1",
            )

    def test_anonymized_id_in_log(self, tmp_event_store: EventStore, raw_user_id: str):
        """The anonymized hash should appear in the log."""
        anon = anonymize_user_id(raw_user_id)
        event = Event(
            user_id=anon,
            event_type="stack_created",
            session_id="s1",
        )
        tmp_event_store.append(event)
        raw_text = open(tmp_event_store.filepath, encoding="utf-8").read()
        assert anon in raw_text


# ---------------------------------------------------------------------------
# Data retention / purge tests
# ---------------------------------------------------------------------------

class TestDataRetention:
    """Tests for EventStore.purge_expired()."""

    def test_purge_removes_expired_events(self, tmp_event_store: EventStore, anon_user_id: str):
        """Events older than retention_days should be purged."""
        old_ts = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
        # Write an old event by constructing it manually then appending.
        old_event = Event(
            user_id=anon_user_id,
            event_type="stack_created",
            timestamp=old_ts,
            session_id="old",
        )
        tmp_event_store.append(old_event)
        # Write a fresh event.
        tmp_event_store.append(
            Event(
                user_id=anon_user_id,
                event_type="stack_created",
                session_id="fresh",
            )
        )
        before = tmp_event_store.get_all_events()
        assert len(before) == 2

        retained = tmp_event_store.purge_expired(retention_days=30)
        assert retained == 1  # only the fresh event remains

        after = tmp_event_store.get_all_events()
        assert len(after) == 1
        assert after[0].session_id == "fresh"

    def test_purge_keeps_recent_events(self, tmp_event_store: EventStore, anon_user_id: str):
        """Events within retention should survive purge."""
        recent_ts = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        tmp_event_store.append(
            Event(
                user_id=anon_user_id,
                event_type="ai_search",
                timestamp=recent_ts,
                session_id="recent",
            )
        )
        retained = tmp_event_store.purge_expired(retention_days=30)
        assert retained == 1

    def test_purge_with_zero_days_keeps_nothing(self, tmp_event_store: EventStore, anon_user_id: str):
        """purge_expired(retention_days=0) should remove all events."""
        tmp_event_store.append(
            Event(user_id=anon_user_id, event_type="stack_created", session_id="s1")
        )
        retained = tmp_event_store.purge_expired(retention_days=0, now=time.time() + 1)
        assert retained == 0


# ---------------------------------------------------------------------------
# Consent model tests
# ---------------------------------------------------------------------------

class TestConsentRecord:
    """Tests for the ConsentRecord model."""

    def test_default_retention_days(self, anon_user_id: str):
        """ConsentRecord.data_retention_days defaults to 30."""
        rec = ConsentRecord(user_id=anon_user_id, consent_given=True)
        assert rec.data_retention_days == 30

    def test_default_opt_in_features_empty(self, anon_user_id: str):
        """ConsentRecord.opt_in_features defaults to empty list."""
        rec = ConsentRecord(user_id=anon_user_id, consent_given=True)
        assert rec.opt_in_features == []

    def test_retention_days_minimum_one(self, anon_user_id: str):
        """data_retention_days must be >= 1."""
        with pytest.raises(ValueError):
            ConsentRecord(user_id=anon_user_id, consent_given=True, data_retention_days=0)

    def test_consent_timestamp_defaults_to_now(self, anon_user_id: str):
        """consent_timestamp should default to current UTC time."""
        before = datetime.now(timezone.utc)
        rec = ConsentRecord(user_id=anon_user_id, consent_given=True)
        after = datetime.now(timezone.utc)
        parsed = datetime.fromisoformat(rec.consent_timestamp)
        assert before <= parsed <= after


# ---------------------------------------------------------------------------
# ConsentStore tests
# ---------------------------------------------------------------------------

class TestConsentStore:
    """Tests for ConsentStore give / revoke / check / status."""

    def test_give_consent_creates_record(self, tmp_consent_store: ConsentStore, raw_user_id: str):
        """give_consent should create a ConsentRecord with consent_given=True."""
        record = tmp_consent_store.give_consent(raw_user_id, ["ai_search"])
        assert record.consent_given is True
        assert "ai_search" in record.opt_in_features
        assert record.user_id == anonymize_user_id(raw_user_id)

    def test_give_consent_stores_anonymized(self, tmp_consent_store: ConsentStore, raw_user_id: str):
        """The raw user ID must not appear in the consent file."""
        tmp_consent_store.give_consent(raw_user_id, ["ai_search"])
        raw_text = open(tmp_consent_store.filepath, encoding="utf-8").read()
        assert raw_user_id not in raw_text

    def test_give_consent_rejects_unknown_feature(self, tmp_consent_store: ConsentStore, raw_user_id: str):
        """Features not in ALLOWED_OPT_IN_FEATURES should be rejected."""
        with pytest.raises(ValueError, match="Unknown opt-in feature"):
            tmp_consent_store.give_consent(raw_user_id, ["unknown_feature"])

    def test_check_consent_true_when_opted_in(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """check_consent should return True for an opted-in feature."""
        tmp_consent_store.give_consent(raw_user_id, ["ai_search", "ai_optimize"])
        assert tmp_consent_store.check_consent(raw_user_id, "ai_search") is True
        assert tmp_consent_store.check_consent(raw_user_id, "ai_optimize") is True

    def test_check_consent_false_when_not_opted_in(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """check_consent should return False for a feature not opted into."""
        tmp_consent_store.give_consent(raw_user_id, ["ai_search"])
        assert tmp_consent_store.check_consent(raw_user_id, "ai_optimize") is False

    def test_check_consent_false_when_no_record(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """check_consent should return False when no consent record exists."""
        assert tmp_consent_store.check_consent(raw_user_id, "ai_search") is False

    def test_check_consent_false_after_revoke(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """check_consent should return False after revoke_consent."""
        tmp_consent_store.give_consent(raw_user_id, ["ai_search"])
        tmp_consent_store.revoke_consent(raw_user_id)
        assert tmp_consent_store.check_consent(raw_user_id, "ai_search") is False

    def test_revoke_consent_removes_features(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """revoke_consent should set consent_given=False and clear features."""
        tmp_consent_store.give_consent(raw_user_id, ["ai_search"])
        result = tmp_consent_store.revoke_consent(raw_user_id)
        assert result is True
        status = tmp_consent_store.get_consent_status(raw_user_id)
        assert status.consent_given is False
        assert status.opt_in_features == []

    def test_revoke_consent_returns_false_if_no_record(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """revoke_consent should return False if no record exists."""
        assert tmp_consent_store.revoke_consent(raw_user_id) is False

    def test_get_consent_status_returns_none_without_record(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """get_consent_status should return None when no record exists."""
        assert tmp_consent_store.get_consent_status(raw_user_id) is None

    def test_get_consent_status_returns_record(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """get_consent_status should return the full record."""
        tmp_consent_store.give_consent(raw_user_id, ["ai_search"])
        status = tmp_consent_store.get_consent_status(raw_user_id)
        assert status is not None
        assert status.consent_given is True
        assert status.data_retention_days == 30
        assert "ai_search" in status.opt_in_features

    def test_check_consent_accepts_anonymized_id(
        self, tmp_consent_store: ConsentStore, raw_user_id: str
    ):
        """check_consent should accept an already-hashed user_id."""
        anon = anonymize_user_id(raw_user_id)
        tmp_consent_store.give_consent(raw_user_id, ["ai_search"])
        assert tmp_consent_store.check_consent(anon, "ai_search") is True


# ---------------------------------------------------------------------------
# Privacy rules tests
# ---------------------------------------------------------------------------

class TestPrivacyRules:
    """Tests for the static PrivacyRules declaration."""

    def test_privacy_rules_all_returns_list(self):
        """all() should return a non-empty list of rule strings."""
        rules = PrivacyRules.all()
        assert isinstance(rules, list)
        assert len(rules) >= 4

    def test_privacy_rules_include_pixel_rule(self):
        """The no-pixels-without-opt-in rule should be present."""
        rules = PrivacyRules.all()
        assert any("pixel" in r.lower() for r in rules)

    def test_privacy_rules_include_no_raw_ids(self):
        """The no-raw-user-ids rule should be present."""
        rules = PrivacyRules.all()
        assert any("raw" in r.lower() and "user" in r.lower() for r in rules)

    def test_allowed_features_defined(self):
        """ALLOWED_OPT_IN_FEATURES should be a non-empty tuple."""
        assert isinstance(PrivacyRules.ALLOWED_OPT_IN_FEATURES, tuple)
        assert len(PrivacyRules.ALLOWED_OPT_IN_FEATURES) > 0

    def test_default_retention_days_is_30(self):
        """Default retention should be 30 days."""
        assert PrivacyRules.DEFAULT_RETENTION_DAYS == 30
