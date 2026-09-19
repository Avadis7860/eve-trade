"""Unit tests for the price ladder (sections 10 & 13)."""
from __future__ import annotations

import pytest

from app.engine.ladder import PriceLadder, aggregate, best_price, fill


def _sell_orders():
    # price -> volume ; several at the best price (cheapest), one absurd outlier
    return [(3.90, 1000), (3.90, 500), (3.95, 2000), (3.99, 800), (300_000_000, 1)]


def _buy_orders():
    return [(5.00, 300), (4.99, 1000), (4.95, 500), (4.50, 7), (0.01, 5)]


class TestAggregate:
    def test_groups_same_price(self):
        levels = aggregate(_sell_orders(), descending=False)
        # cheapest first
        assert levels[0].price == 3.90
        assert levels[0].volume == 1500
        assert levels[0].orders == 2
        assert levels[0].cumulative == 1500
        assert levels[-1].price == 300_000_000
        assert levels[-1].volume == 1

    def test_descending_best_is_highest(self):
        levels = aggregate(_buy_orders(), descending=True)
        assert levels[0].price == 5.00
        assert levels[0].cumulative == 300  # only 300 at 5.00

    def test_cumulative_increases(self):
        levels = aggregate(_sell_orders(), descending=False)
        vols = [lv.volume for lv in levels]
        cums = [lv.cumulative for lv in levels]
        assert cums == [sum(vols[: i + 1]) for i in range(len(vols))]

    def test_zero_volume_orders_ignored(self):
        levels = aggregate([(1.0, 5), (1.0, 0), (2.0, 3)], descending=False)
        assert levels[0].price == 1.0
        assert levels[0].volume == 5


class TestBestPrice:
    def test_best_sell_is_lowest(self):
        levels = aggregate(_sell_orders(), descending=False)
        assert best_price(levels) == 3.90

    def test_best_buy_is_highest(self):
        levels = aggregate(_buy_orders(), descending=True)
        assert best_price(levels) == 5.00

    def test_empty_returns_none(self):
        assert best_price([]) is None


class TestFill:
    def test_fill_up_to_best_volume(self):
        levels = aggregate(_sell_orders(), descending=False)
        f = fill(levels, 500)
        assert f.filled_quantity == 500
        assert f.effective_price == 3.90  # all within best level

    def test_fill_walks_ladder(self):
        levels = aggregate(_sell_orders(), descending=False)
        # 1500 @ 3.90 + 2000 @ 3.95 = 3500 total; ask for 2000
        f = fill(levels, 2000)
        assert f.filled_quantity == 2000
        expected_avg = (1500 * 3.90 + 500 * 3.95) / 2000
        assert f.effective_price == pytest.approx(expected_avg)
        assert f.levels_used == 2

    def test_fill_more_than_available(self):
        levels = aggregate(_sell_orders(), descending=False)
        total = sum(lv.volume for lv in levels)
        f = fill(levels, total + 50)
        assert f.filled_quantity == total

    def test_fill_zero_quantity(self):
        levels = aggregate(_sell_orders(), descending=False)
        f = fill(levels, 0)
        assert f.filled_quantity == 0
        assert f.effective_price == 0.0
