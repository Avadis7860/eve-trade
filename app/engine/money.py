"""Money / rounding helpers (section 9, rounding note).

The engine computes in full float precision. Rounding to EVE's whole-ISK
convention is an explicit, swappable policy applied only at display time so
unit tests stay deterministic.  (EVE floors transaction ISK to integers; see
``floor_isk``.)
"""
from __future__ import annotations

import math
from enum import Enum


class RoundingPolicy(str, Enum):
    NONE = "none"        # precise float — engine/tests default
    FLOOR_ISK = "floor_isk"  # EVE: floor to whole ISK


def floor_isk(value: float) -> int:
    """Round *down* to the nearest ISK (EVE transaction convention)."""
    return math.floor(value + 1e-9)


def round_money(value: float, precision: int = 2,
                policy: RoundingPolicy = RoundingPolicy.NONE) -> float:
    if policy is RoundingPolicy.NONE:
        return float(value)
    if policy is RoundingPolicy.FLOOR_ISK:
        return float(floor_isk(value))
    return float(value)
