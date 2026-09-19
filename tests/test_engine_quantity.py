"""Unit tests for QuantityCalculator (sections 10 & 11)."""
from __future__ import annotations

import pytest

from app.engine.quantity import QuantityCalculator, QuantityResult


def test_returns_quantity_result():
    q = QuantityCalculator.compute(100, 1000, 1_000_000, 0.0145)
    assert isinstance(q, QuantityResult)


def test_zero_volume():
    q = QuantityCalculator.compute(100, 0, 1_000_000, 0.0145)
    assert q.max_trade_quantity == 0
    assert q.capital_required == 0.0
    assert q.market_available_volume == 0


def test_insufficient_capital():
    # unit cost = 100 * 1.0145 = 101.45 ; 5000 / 101.45 -> 49 units
    q = QuantityCalculator.compute(100, 1000, 5000, 0.0145)
    assert q.max_affordable_quantity == 49
    assert q.max_trade_quantity == 49
    assert q.capital_required == pytest.approx(49 * 101.45)
    assert q.capital_required <= 5000


def test_capital_exactly_enough():
    # fee 0 -> unit cost 100 ; 5000 / 100 = 50
    q = QuantityCalculator.compute(100, 10_000, 5000, 0.0)
    assert q.max_affordable_quantity == 50
    assert q.max_trade_quantity == 50
    assert q.capital_required == pytest.approx(5000)


def test_surplus_capital_caps_by_market():
    q = QuantityCalculator.compute(100, 10, 1_000_000_000, 0.0145)
    assert q.max_affordable_quantity > 10
    assert q.max_trade_quantity == 10  # market volume is the limit
    assert q.capital_required == pytest.approx(10 * 101.45)


def test_zero_price_free_item():
    q = QuantityCalculator.compute(0, 1000, 1_000_000, 0.0145)
    assert q.max_trade_quantity == 1000  # capital unconstrained
    assert q.capital_required == 0.0


def test_zero_capital():
    q = QuantityCalculator.compute(100, 1000, 0, 0.0145)
    assert q.max_trade_quantity == 0
    assert q.capital_required == 0.0


def test_zero_fee():
    q = QuantityCalculator.compute(100, 1_000_000, 1_000_000, 0.0)
    assert q.max_affordable_quantity == 10_000
    assert q.max_trade_quantity == 10_000
    assert q.capital_required == pytest.approx(10_000 * 100)


def test_effective_quantity_is_min_of_cap_and_market():
    # capital allows 8 units, market has 1000 -> 8
    q = QuantityCalculator.compute(100, 1000, 800, 0.0)
    assert q.max_trade_quantity == 8
