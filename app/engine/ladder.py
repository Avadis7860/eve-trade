"""Price-ladder aggregation for realistic market-depth & available volume
(sections 10, 13).

The order book is aggregated by price level so we can answer:
  * best price (top of book)
  * volume available at the best price
  * total fillable volume
  * effective (volume-weighted) price when walking N units up the ladder

Pure & dependency-free; operates on ``(price, volume_remain)`` tuples.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Sequence

PriceVolume = tuple[float, int]


@dataclass(frozen=True, slots=True)
class PriceLevel:
    price: float
    volume: int
    orders: int
    cumulative: int


@dataclass(frozen=True, slots=True)
class Fill:
    filled_quantity: int
    effective_price: float   # volume-weighted average across the walk
    levels_used: int


def aggregate(orders: Sequence[PriceVolume], descending: bool = False) -> list[PriceLevel]:
    """Group orders by price, summing volume_remaining; sort best-first.

    ``descending=True`` => highest price first (best for *buy* side / disposal).
    ``descending=False`` => lowest price first (best for *sell* side / acquisition).
    """
    volumes: dict[float, int] = defaultdict(int)
    counts: dict[float, int] = defaultdict(int)
    for price, vol in orders:
        if vol <= 0:
            continue
        volumes[price] += vol
        counts[price] += 1
    levels = sorted(volumes.items(), key=lambda kv: kv[0], reverse=descending)
    result: list[PriceLevel] = []
    cumulative = 0
    for price, vol in levels:
        cumulative += vol
        result.append(PriceLevel(
            price=price, volume=vol, orders=counts[price], cumulative=cumulative,
        ))
    return result


def best_price(levels: Sequence[PriceLevel]) -> float | None:
    return levels[0].price if levels else None


def fill(levels: Sequence[PriceLevel], quantity: int) -> Fill:
    """Walk the ladder (already sorted best-first) filling ``quantity`` units."""
    remaining = max(0, int(quantity))
    spent = 0.0
    used = 0
    for lv in levels:
        if remaining <= 0:
            break
        take = min(remaining, lv.volume)
        spent += take * lv.price
        remaining -= take
        used += 1
    filled = quantity - remaining if quantity > 0 else 0
    avg = spent / filled if filled > 0 else 0.0
    return Fill(filled_quantity=filled, effective_price=avg, levels_used=used)


class PriceLadder:
    """Facade grouping the ladder operations (kept as a class for testability)."""

    aggregate = staticmethod(aggregate)
    best_price = staticmethod(best_price)
    fill = staticmethod(fill)
