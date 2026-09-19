"""Quantity / capital modelling (sections 10 & 11).

Determines how much of an item can actually be traded given market depth and
the user's available capital. Pure & dependency-free.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class QuantityResult:
    max_affordable_quantity: int     # units affordable with available capital
    market_available_volume: int     # volume available at the best price
    max_trade_quantity: int          # min(market, capital) per section 11
    capital_required: float          # ISK needed to fund max_trade_quantity


class QuantityCalculator:
    """Section 11: cap the trade by capital AND market volume."""

    @staticmethod
    def unit_acquisition_cost(buy_price: float, broker_fee: float) -> float:
        """ISK spent per unit acquired (price + broker fee)."""
        return buy_price * (1.0 + broker_fee)

    @staticmethod
    def max_affordable_quantity(buy_price: float, broker_fee: float,
                                available_capital: float) -> int:
        if available_capital <= 0:
            return 0
        unit = QuantityCalculator.unit_acquisition_cost(buy_price, broker_fee)
        if unit <= 0:
            # free item: capital cannot constrain -> caller caps by market
            return -1  # sentinel = unlimited
        return int(available_capital // unit)

    @staticmethod
    def compute(buy_price: float, available_market_volume: int,
                available_capital: float, broker_fee: float) -> QuantityResult:
        market_vol = max(0, int(available_market_volume))
        if market_vol == 0:
            return QuantityResult(0, 0, 0, 0.0)

        unit = QuantityCalculator.unit_acquisition_cost(buy_price, broker_fee)
        if unit <= 0:
            max_afford = market_vol  # capital-unconstrained
        elif available_capital <= 0:
            max_afford = 0
        else:
            max_afford = int(available_capital // unit)

        max_trade = min(market_vol, max_afford)
        capital_required = max_trade * unit
        return QuantityResult(
            max_affordable_quantity=max_afford,
            market_available_volume=market_vol,
            max_trade_quantity=max_trade,
            capital_required=capital_required,
        )
