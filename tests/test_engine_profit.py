"""Unit tests: FeeCalculator + ProfitCalculator (section 25)."""
from __future__ import annotations

import pytest

from app.engine.fee import FeeBreakdown, FeeCalculator
from app.engine.profit import ProfitCalculator, ProfitResult


# ------------------------------------------------------------------ fee
class TestFeeCalculator:
    def test_broker_cost_zero_fee(self):
        assert FeeCalculator.broker_cost(1_000_000, 0.0) == 0.0

    def test_sales_tax_zero_rate(self):
        assert FeeCalculator.sales_tax_cost(1_000_000, 0.0) == 0.0

    def test_standard_rates(self):
        bc = FeeCalculator.broker_cost(50_000_000, 0.0145)
        stc = FeeCalculator.sales_tax_cost(75_000_000, 0.035)
        assert bc == pytest.approx(725_000)
        assert stc == pytest.approx(2_625_000)

    def test_total_cost_sums_components(self):
        assert FeeCalculator.total_cost(100_000, 0.0145, 150_000, 0.035) == pytest.approx(
            100_000 + 1_450 + 5_250
        )

    def test_breakdown_is_validated(self):
        bd = FeeCalculator.breakdown(1_000_000, 0.01, 2_000_000, 0.035)
        assert isinstance(bd, FeeBreakdown)
        assert bd.broker_cost == pytest.approx(10_000)
        assert bd.sales_tax_cost == pytest.approx(70_000)
        assert bd.total_cost == pytest.approx(1_000_000 + 10_000 + 70_000)


# --------------------------------------------------------------- profit
class TestProfitCalculator:
    def test_section2_conceptual_example(self):
        r = ProfitCalculator.compute(100_000, 150_000, 500, 0.0145, 0.035)
        assert isinstance(r, ProfitResult)
        assert r.purchase_cost == pytest.approx(50_000_000)
        assert r.broker_cost == pytest.approx(725_000)
        assert r.gross_revenue == pytest.approx(75_000_000)
        assert r.sales_tax_cost == pytest.approx(2_625_000)
        assert r.total_cost == pytest.approx(53_350_000)
        assert r.net_profit == pytest.approx(21_650_000)
        assert r.profit_per_unit == pytest.approx(43_300)
        assert r.roi == pytest.approx(21_650_000 / 53_350_000)
        assert r.margin == pytest.approx(21_650_000 / 75_000_000)
        assert r.is_profitable is True

    def test_zero_volume(self):
        r = ProfitCalculator.compute(100_000, 200_000, 0, 0.0145, 0.035)
        assert r.purchase_cost == 0
        assert r.gross_revenue == 0
        assert r.net_profit == 0
        assert r.roi == 0.0
        assert r.margin == 0.0
        assert r.is_profitable is False

    def test_zero_price(self):
        # free acquisition: no purchase/broker cost, sales tax still on the sale
        r = ProfitCalculator.compute(0, 200_000, 100, 0.0145, 0.035)
        assert r.purchase_cost == 0
        assert r.broker_cost == 0
        assert r.net_profit == pytest.approx(200_000 * 100 * (1 - 0.035))
        assert r.is_profitable is True

    def test_equal_prices_are_losing(self):
        r = ProfitCalculator.compute(100_000, 100_000, 100, 0.0145, 0.035)
        expected = 100_000 * 100 * (1 - 0.035) - 100_000 * 100 * (1 + 0.0145)
        assert r.net_profit == pytest.approx(expected)
        assert r.is_profitable is False
        assert r.net_profit < 0

    def test_sell_below_buy_is_losing(self):
        r = ProfitCalculator.compute(100, 50, 1000, 0.0145, 0.035)
        assert r.net_profit < 0
        assert r.roi < 0
        assert r.margin < 0
        assert r.is_profitable is False

    def test_huge_volume(self):
        r = ProfitCalculator.compute(1, 2, 1_000_000_000, 0.0145, 0.035)
        assert r.quantity == 1_000_000_000
        assert r.net_profit > 0
        per_unit = 2 - 1 - (1 * 0.0145) - (2 * 0.035)
        assert r.profit_per_unit == pytest.approx(per_unit)

    def test_quantity_float_is_coerced(self):
        r = ProfitCalculator.compute(10, 20, 5.9, 0.0, 0.0)
        assert r.quantity == 5
        assert r.purchase_cost == pytest.approx(50)

    def test_negative_quantity_clamped(self):
        r = ProfitCalculator.compute(10, 20, -5, 0.0, 0.0)
        assert r.quantity == 0
        assert r.net_profit == 0


@pytest.mark.parametrize("fee,tax", [(0.0, 0.0), (0.0145, 0.035), (0.05, 0.1)])
class TestProfitFeeMatrix:
    def test_net_equals_spread_minus_fees(self, fee, tax):
        buy, sell, qty = 100.0, 200.0, 50
        r = ProfitCalculator.compute(buy, sell, qty, fee, tax)
        expected = sell * qty - buy * qty * (1 + fee) - sell * qty * tax
        assert r.net_profit == pytest.approx(expected)

    def test_margin_definition(self, fee, tax):
        r = ProfitCalculator.compute(100.0, 200.0, 50, fee, tax)
        assert r.margin == pytest.approx(r.net_profit / r.gross_revenue)

    def test_roi_definition(self, fee, tax):
        r = ProfitCalculator.compute(100.0, 200.0, 50, fee, tax)
        assert r.roi == pytest.approx(r.net_profit / r.total_cost)
