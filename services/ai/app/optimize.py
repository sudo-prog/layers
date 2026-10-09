"""Parameter optimisation for effect stacks.

If ``optuna`` is available, we use it as the optimisation backend.  Otherwise
we fall back to a compact CMA-ES implementation backed by *numpy* only.

The objective is a *proxy fidelity* score (see :mod:`app.search`) between the
optimised stack parameters and the target :class:`~app.models.FeatureVector`,
with a hard penalty for exceeding the 8-pass mobile budget.

Multi-scale: when a list of FeatureVectors is provided (e.g. from
:func:`app.extractors.pipeline.extract_features_multiscale`), scores are
averaged across scales.

NO RENDERING is performed — all scoring is proxy-based.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np

from app.models import FeatureVector
from app.search import (
    MAX_PASSES,
    _stack_passes,
    _proxy_fidelity,
    _core_pass_cost,
)

try:
    import optuna
    _HAS_OPTUNA = True
except ImportError:
    _HAS_OPTUNA = False


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class OptimizationResult:
    """Result of a parameter optimisation run."""
    optimized_params: dict[str, Any]
    score: float
    trace: list[float]


# ---------------------------------------------------------------------------
# CMA-ES fallback (numpy only)
# ---------------------------------------------------------------------------

class _SimpleCMAES:
    """A minimal CMA-ES implementation for bounded parameter optimisation.

    Not a full CMA-ES — this is a compact (1+1)-style evolution strategy
    with diagonal covariance adaptation, sufficient for the small
    parameter spaces used here.
    """

    def __init__(
        self,
        dim: int,
        bounds: list[tuple[float, float]],
        rng: np.random.Generator,
        sigma: float = 0.3,
    ) -> None:
        self.dim = dim
        self.bounds = bounds
        self.rng = rng
        self.sigma = sigma

        # Initial mean: midpoint of each bound.
        lo = np.array([b[0] for b in bounds])
        hi = np.array([b[1] for b in bounds])
        self.mean = (lo + hi) / 2.0
        self.lo = lo
        self.hi = hi
        # Step-size adaptation.
        self.step_size = sigma

    def _clip(self, x: np.ndarray) -> np.ndarray:
        return np.clip(x, self.lo, self.hi)

    def ask(self) -> np.ndarray:
        """Sample a new candidate point."""
        x = self.mean + self.step_size * self.rng.standard_normal(self.dim)
        return self._clip(x)

    def tell(self, x: np.ndarray, fitness: float) -> None:
        """Update the distribution based on a sampled point and its fitness."""
        # Move mean toward better points (higher fitness).
        # Simple rank-based update.
        direction = x - self.mean
        grad_step = fitness * direction  # positive fitness pulls mean toward x
        self.mean = self.mean + 0.1 * grad_step
        self.mean = self._clip(self.mean)
        # Decay step size.
        self.step_size *= 0.995


# ---------------------------------------------------------------------------
# Parameter extraction / injection
# ---------------------------------------------------------------------------

def _extract_param_info(
    stack: list[dict[str, Any]],
) -> tuple[dict[str, float], list[tuple[str, str, float, float]]]:
    """Extract optimisable parameters from stack layers.

    Returns:
        A dict mapping ``"layer_i.key"`` -> current_value,
        A list of (param_id, key, lo, hi) describing the search space.
    """
    current: dict[str, float] = {}
    space: list[tuple[str, str, float, float]] = []
    for i, layer in enumerate(stack):
        params = layer.get("params", {})
        for key, val in params.items():
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                pid = f"layer_{i}.{key}"
                current[pid] = float(val)
                # Search space: ±50% of initial value, clamped to [0.01, 3.0].
                v = abs(float(val)) if float(val) != 0 else 1.0
                lo = max(0.01, v * 0.5)
                hi = min(3.0, v * 1.5)
                if lo >= hi:
                    lo = 0.01
                    hi = max(0.02, v)
                space.append((pid, key, lo, hi))
    return current, space


def _inject_params(
    stack: list[dict[str, Any]],
    params: dict[str, float],
) -> list[dict[str, Any]]:
    """Return a deep copy of *stack* with parameters from *params* injected."""
    import copy
    new_stack = copy.deepcopy(stack)
    for i, layer in enumerate(new_stack):
        for key, val in layer.get("params", {}).items():
            pid = f"layer_{i}.{key}"
            if pid in params:
                layer["params"][key] = params[pid]
    return new_stack


# ---------------------------------------------------------------------------
# Objective function
# ---------------------------------------------------------------------------

def _make_objective(
    base_stack: list[dict[str, Any]],
    features_list: list[FeatureVector],
    param_space: list[tuple[str, str, float, float]],
) -> Callable[[np.ndarray], float]:
    """Create the objective function for optimisation."""
    bounds = [(lo, hi) for _, _, lo, hi in param_space]

    def objective(x: np.ndarray) -> float:
        params: dict[str, float] = {}
        for (pid, _key, _lo, _hi), val in zip(param_space, x):
            params[pid] = float(val)
        candidate_stack = _inject_params(base_stack, params)
        passes = _stack_passes(candidate_stack)
        if passes > MAX_PASSES:
            return -1.0  # Hard penalty: budget overflow.
        # Proxy fidelity averaged across scales.
        fidelities = []
        for fv in features_list:
            f = _proxy_fidelity(candidate_stack, fv)
            fidelities.append(f)
        avg_fidelity = float(np.mean(fidelities))
        # Normalise to [0, 1]
        avg_fidelity = max(0.0, min(1.0, (avg_fidelity + 1.0) / 2.0))
        return avg_fidelity

    return objective


# ---------------------------------------------------------------------------
# Public optimisation API
# ---------------------------------------------------------------------------

def optimize_stack(
    stack: list[dict[str, Any]],
    features: FeatureVector | list[FeatureVector],
    max_trials: int = 200,
    seed: int | None = 42,
) -> OptimizationResult:
    """Optimise the parameters of an effect stack.

    Args:
        stack: The base effect stack (list of layer dicts).  Parameters in
            each layer's ``params`` dict are tuned.
        features: A target :class:`FeatureVector`, or a list of them for
            multi-scale optimisation.
        max_trials: Maximum optimisation trials (default 200).
        seed: RNG seed for reproducibility.

    Returns:
        :class:`OptimizationResult` with optimised parameters, best score,
        and a trace of score-per-trial.
    """
    if isinstance(features, FeatureVector):
        features_list = [features]
    else:
        features_list = features if features else [features] if False else []  # noqa: E501

    if not stack or not features_list:
        return OptimizationResult(
            optimized_params={},
            score=0.0,
            trace=[],
        )

    current, space = _extract_param_info(stack)
    if not space:
        # No optimisable parameters — return as-is.
        passes = _stack_passes(stack)
        if passes > MAX_PASSES:
            return OptimizationResult(optimized_params=current, score=-1.0, trace=[])
        fidelities = [_proxy_fidelity(stack, fv) for fv in features_list]
        avg_f = max(0.0, min(1.0, (float(np.mean(fidelities)) + 1.0) / 2.0))
        return OptimizationResult(
            optimized_params=current,
            score=avg_f,
            trace=[avg_f],
        )

    objective = _make_objective(stack, features_list, space)
    trace: list[float] = []

    rng = np.random.default_rng(seed)

    if _HAS_OPTUNA:
        # Use Optuna with a numpy-parameterised search space.
        bounds_lo = [float(b[2]) for b in space]
        bounds_hi = [float(b[3]) for b in space]

        study = optuna.create_study(direction="maximize")

        def _optuna_objective(trial: Any) -> float:
            x = np.array([
                trial.suggest_float(f"p{i}", lo, hi)
                for i, (lo, hi) in enumerate(zip(bounds_lo, bounds_hi))
            ])
            score = objective(x)
            trace.append(score)
            return score

        study.optimize(_optuna_objective, n_trials=max_trials)

        best_params: dict[str, float] = {}
        for i, (pid, _key, _lo, _hi) in enumerate(space):
            best_params[pid] = float(study.best_params[f"p{i}"])
        return OptimizationResult(
            optimized_params=best_params,
            score=float(study.best_value),
            trace=trace,
        )
    else:
        # CMA-ES fallback.
        cmaes = _SimpleCMAES(
            dim=len(space),
            bounds=[(float(b[2]), float(b[3])) for b in space],
            rng=rng,
        )

        best_score = -float("inf")
        best_point = np.array([current.get(pid, 0.5) for pid, _, _, _ in space])

        for trial_idx in range(max_trials):
            x = cmaes.ask()
            score = objective(x)
            trace.append(score)
            if score > best_score:
                best_score = score
                best_point = x
            cmaes.tell(x, score)

        best_params: dict[str, float] = {}
        for (pid, _key, _lo, _hi), val in zip(space, best_point):
            best_params[pid] = float(val)

        return OptimizationResult(
            optimized_params=best_params,
            score=best_score,
            trace=trace,
        )


__all__ = [
    "OptimizationResult",
    "optimize_stack",
]
