"""Unit tests for Stage 2.1 — learned ranker (acceptance-history-based ranking).

Tests cover:
  * AcceptanceRateRanker scoring and ranking
  * Cold-start behaviour (no history)
  * Ranking order reflects acceptance rates
  * Integration with AcceptanceRateTracker and event log
  * Edge cases: empty history, single record, all-same-rate
"""

from __future__ import annotations

import pytest

from app.models import FeatureVector
from app.events import Event, EventStore, anonymize_user_id
from app.hypothesis import CandidateCore
from app.ranker import (
    AcceptanceRateRanker,
    RankScore,
    rank_hypotheses,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_store(tmp_path) -> EventStore:
    """A fresh EventStore in a temp directory."""
    return EventStore(data_dir=str(tmp_path / "ranker_events"))


@pytest.fixture
def anon_uid() -> str:
    return anonymize_user_id("ranker_test@example.com")


@pytest.fixture
def warm_features() -> FeatureVector:
    """Warm, vibrant feature vector."""
    return FeatureVector(
        palette=[(220, 50, 30), (240, 180, 20)],
        edges={"magnitude": 55.0, "direction": 0.0, "edge_density": 0.35},
        frequency={"low": 0.2, "mid": 0.3, "high": 0.5},
        tone={"mean": 200.0, "std": 75.0, "histogram": [0.0] * 256},
    )


@pytest.fixture
def sample_hypotheses() -> list[CandidateCore]:
    """A list of candidate cores to rank."""
    return [
        CandidateCore(
            core_type="color_warm_core",
            parameters={"hue": "warm", "rgb": [220, 50, 30]},
            confidence=0.8,
            reasoning="Warm palette dominant.",
        ),
        CandidateCore(
            core_type="color_cool_core",
            parameters={"hue": "cool", "rgb": [30, 50, 120]},
            confidence=0.7,
            reasoning="Cool palette detected.",
        ),
        CandidateCore(
            core_type="edge_geometric_core",
            parameters={"edge_density": 0.35, "magnitude": 55.0},
            confidence=0.75,
            reasoning="Sharp geometric structure.",
        ),
        CandidateCore(
            core_type="texture_fine_core",
            parameters={"high_freq_ratio": 0.5},
            confidence=0.6,
            reasoning="Fine texture detected.",
        ),
    ]


def _make_layer(core: str, params: dict | None = None) -> dict:
    """Build a standard effect-stack layer dict."""
    return {
        "core": core,
        "params": params or {},
        "opacity": 1.0,
        "blend": "normal",
        "mask": None,
        "enabled": True,
    }


# ---------------------------------------------------------------------------
# RankScore dataclass tests
# ---------------------------------------------------------------------------

class TestRankScore:
    """Tests for the RankScore dataclass."""

    def test_create_rank_score(self):
        """RankScore should be constructible with all fields."""
        h = CandidateCore(
            core_type="test_core",
            parameters={},
            confidence=0.5,
            reasoning="test",
        )
        rs = RankScore(
            hypothesis=h,
            base_confidence=0.5,
            acceptance_rate=0.8,
            combined_score=0.65,
            rank=1,
        )
        assert rs.hypothesis.core_type == "test_core"
        assert rs.base_confidence == 0.5
        assert rs.acceptance_rate == 0.8
        assert rs.combined_score == 0.65
        assert rs.rank == 1


# ---------------------------------------------------------------------------
# AcceptanceRateRanker tests
# ---------------------------------------------------------------------------

class TestAcceptanceRateRanker:
    """Tests for AcceptanceRateRanker."""

    def test_ranker_with_no_history_returns_cold_start_scores(
        self, tmp_store: EventStore, sample_hypotheses: list[CandidateCore],
    ):
        """With no event history, all hypotheses should get cold-start scores."""
        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank(sample_hypotheses)
        assert len(results) == len(sample_hypotheses)
        # Cold start: acceptance_rate should be 0.0 for all
        for rs in results:
            assert rs.acceptance_rate == 0.0
            # Combined score should equal base confidence * weight
            assert rs.combined_score > 0.0

    def test_ranker_ranks_higher_acceptance_first(
        self, tmp_store: EventStore, anon_uid: str, warm_features: FeatureVector,
        sample_hypotheses: list[CandidateCore],
    ):
        """Hypotheses with higher acceptance rates should rank higher."""
        # Record that color_warm_core has 100% acceptance (1 suggested, 1 applied)
        # and color_cool_core has 0% acceptance (1 suggested, 0 applied)
        warm_stack = [_make_layer("color_warm_core", {"edge_density": 0.35, "magnitude": 60.0})]
        cool_stack = [_make_layer("color_cool_core", {"edge_density": 0.02, "magnitude": 10.0})]

        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_created", session_id="s1",
            metadata={"stack": warm_stack},
        ))
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_applied", session_id="s2",
            metadata={"stack": warm_stack},
        ))
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_created", session_id="s3",
            metadata={"stack": cool_stack},
        ))

        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank(sample_hypotheses, features=warm_features)

        # Find color_warm and color_cool in results
        warm_result = next(r for r in results if r.hypothesis.core_type == "color_warm_core")
        cool_result = next(r for r in results if r.hypothesis.core_type == "color_cool_core")

        # Warm should have higher acceptance rate
        assert warm_result.acceptance_rate > cool_result.acceptance_rate
        # Warm should have higher combined score (or equal if base conf compensates)
        assert warm_result.combined_score >= cool_result.combined_score

    def test_ranker_ranks_by_combined_score_descending(
        self, tmp_store: EventStore, sample_hypotheses: list[CandidateCore],
    ):
        """Results should be sorted by combined_score descending."""
        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank(sample_hypotheses)
        scores = [r.combined_score for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_ranker_assigns_rank_field(
        self, tmp_store: EventStore, sample_hypotheses: list[CandidateCore],
    ):
        """Each result should have a rank starting from 1."""
        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank(sample_hypotheses)
        ranks = [r.rank for r in results]
        assert ranks == list(range(1, len(results) + 1))

    def test_ranker_with_empty_hypotheses(
        self, tmp_store: EventStore,
    ):
        """Ranking an empty list should return an empty list."""
        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank([])
        assert results == []

    def test_ranker_single_hypothesis(
        self, tmp_store: EventStore,
    ):
        """Ranking a single hypothesis should return a single result."""
        ranker = AcceptanceRateRanker(tmp_store)
        h = CandidateCore(
            core_type="color_warm_core",
            parameters={},
            confidence=0.8,
            reasoning="test",
        )
        results = ranker.rank([h])
        assert len(results) == 1
        assert results[0].rank == 1

    def test_ranker_acceptance_rate_boosts_score(
        self, tmp_store: EventStore, anon_uid: str, warm_features: FeatureVector,
    ):
        """A hypothesis with high acceptance should score higher than one with
        low acceptance, given the same base confidence."""
        # Create two hypotheses with identical confidence
        h_high = CandidateCore(
            core_type="color_warm_core",
            parameters={},
            confidence=0.5,
            reasoning="test",
        )
        h_low = CandidateCore(
            core_type="color_cool_core",
            parameters={},
            confidence=0.5,
            reasoning="test",
        )

        # Record 100% acceptance for warm, 0% for cool
        warm_stack = [_make_layer("color_warm_core", {"edge_density": 0.35, "magnitude": 60.0})]
        cool_stack = [_make_layer("color_cool_core", {"edge_density": 0.02, "magnitude": 10.0})]
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_created", session_id="s1",
            metadata={"stack": warm_stack},
        ))
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_applied", session_id="s2",
            metadata={"stack": warm_stack},
        ))
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_created", session_id="s3",
            metadata={"stack": cool_stack},
        ))

        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank([h_high, h_low], features=warm_features)

        warm_result = next(r for r in results if r.hypothesis.core_type == "color_warm_core")
        cool_result = next(r for r in results if r.hypothesis.core_type == "color_cool_core")

        # Warm (100% acceptance) should score higher than cool (0%)
        assert warm_result.combined_score > cool_result.combined_score

    def test_ranker_all_zero_acceptance(
        self, tmp_store: EventStore, anon_uid: str,
        sample_hypotheses: list[CandidateCore],
    ):
        """When all hypotheses have 0% acceptance, ranking is by base confidence."""
        # Record suggestions but no applications
        for h in sample_hypotheses:
            stack = [_make_layer(h.core_type, {})]
            tmp_store.append(Event(
                user_id=anon_uid, event_type="stack_created", session_id=f"s_{h.core_type}",
                metadata={"stack": stack},
            ))

        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank(sample_hypotheses)
        # All acceptance rates should be 0
        for rs in results:
            assert rs.acceptance_rate == 0.0
        # Combined score should still differ based on base confidence
        scores = [r.combined_score for r in results]
        assert len(set(scores)) > 1  # different base confidences → different scores


# ---------------------------------------------------------------------------
# Convenience function tests
# ---------------------------------------------------------------------------

class TestRankHypotheses:
    """Tests for the module-level convenience function."""

    def test_rank_hypotheses_returns_list(self, tmp_store: EventStore):
        """rank_hypotheses should return a list of RankScore."""
        features = FeatureVector(
            palette=[(220, 50, 30)],
            edges={"magnitude": 55.0, "direction": 0.0, "edge_density": 0.35},
            frequency={"low": 0.2, "mid": 0.3, "high": 0.5},
            tone={"mean": 200.0, "std": 75.0, "histogram": [0.0] * 256},
        )
        from app.hypothesis import generate_hypotheses
        candidates = generate_hypotheses(features)
        results = rank_hypotheses(candidates, tmp_store)
        assert isinstance(results, list)
        assert len(results) > 0
        assert all(isinstance(r, RankScore) for r in results)

    def test_rank_hypotheses_sorted_by_rank(self, tmp_store: EventStore):
        """Results should be sorted by rank ascending (best first)."""
        features = FeatureVector(
            palette=[(220, 50, 30)],
            edges={"magnitude": 55.0, "direction": 0.0, "edge_density": 0.35},
            frequency={"low": 0.2, "mid": 0.3, "high": 0.5},
            tone={"mean": 200.0, "std": 75.0, "histogram": [0.0] * 256},
        )
        from app.hypothesis import generate_hypotheses
        candidates = generate_hypotheses(features)
        results = rank_hypotheses(candidates, tmp_store)
        ranks = [r.rank for r in results]
        assert ranks == sorted(ranks)


# ---------------------------------------------------------------------------
# Integration: ranker uses AcceptanceRateTracker correctly
# ---------------------------------------------------------------------------

class TestRankerIntegration:
    """Integration tests tying ranker to AcceptanceRateTracker."""

    def test_ranker_uses_cluster_for_acceptance_lookup(
        self, tmp_store: EventStore, anon_uid: str,
    ):
        """Ranker should look up acceptance by (core_type, cluster) pair."""
        # Create a warm stack in geometric cluster (high edges)
        warm_stack = [_make_layer("color_warm_core", {"edge_density": 0.35, "magnitude": 60.0})]
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_created", session_id="s1",
            metadata={"stack": warm_stack},
        ))
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_applied", session_id="s2",
            metadata={"stack": warm_stack},
        ))

        # A hypothesis in geometric cluster should get the acceptance rate
        h = CandidateCore(
            core_type="color_warm_core",
            parameters={"edge_density": 0.35, "magnitude": 60.0},
            confidence=0.7,
            reasoning="test",
        )
        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank([h])
        assert len(results) == 1
        assert results[0].acceptance_rate == 1.0

    def test_ranker_different_cluster_different_rate(
        self, tmp_store: EventStore, anon_uid: str,
    ):
        """Same core type in different clusters should have different rates."""
        # Warm in geometric: 100% acceptance
        warm_geo = [_make_layer("color_warm_core", {"edge_density": 0.35, "magnitude": 60.0})]
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_created", session_id="s1",
            metadata={"stack": warm_geo},
        ))
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_applied", session_id="s2",
            metadata={"stack": warm_geo},
        ))

        # Warm in organic: 0% acceptance
        warm_org = [_make_layer("color_warm_core", {"edge_density": 0.02, "magnitude": 10.0})]
        tmp_store.append(Event(
            user_id=anon_uid, event_type="stack_created", session_id="s3",
            metadata={"stack": warm_org},
        ))

        # Rank a hypothesis that would be in geometric cluster
        h = CandidateCore(
            core_type="color_warm_core",
            parameters={"edge_density": 0.35, "magnitude": 60.0},
            confidence=0.7,
            reasoning="test",
        )
        ranker = AcceptanceRateRanker(tmp_store)
        results = ranker.rank([h])
        assert results[0].acceptance_rate == 1.0  # geometric cluster rate
