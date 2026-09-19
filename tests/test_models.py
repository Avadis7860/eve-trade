"""Tests for domain models (section 6 data model)."""
from __future__ import annotations

import pytest

from app.models import (
    Category, EveType, FeeConfig, Group, MarketHub, MarketOrder, Region,
    SolarSystem, Station, TradingOpportunity,
)


class TestMarketOrder:
    def test_range_alias_maps_to_order_range(self):
        o = MarketOrder(order_id=1, type_id=34, price=3.9, volume_remain=1000,
                        volume_total=1000, is_buy_order=False, location_id=60,
                        system_id=30000142, range="region", issued="2026-01-01",
                        duration=90, region_id=10000002)
        assert o.order_range == "region"

    def test_buy_order_flag(self):
        o = MarketOrder(order_id=2, type_id=34, price=5.0, volume_remain=10,
                        volume_total=10, is_buy_order=True, location_id=60,
                        system_id=30000142, range="station", issued="x",
                        duration=90, region_id=10000002)
        assert o.is_buy_order is True


class TestEveType:
    def test_defaults(self):
        t = EveType(type_id=34, name="Tritanium", group_id=18)
        assert t.published is True
        assert t.volume == 0.0
        assert t.portion_size == 1


class TestMarketHub:
    def test_ids_unresolved_by_default(self):
        h = MarketHub(name="Jita", region="The Forge", solar_system="Jita",
                      station="Jita IV - Moon 4 - Caldari Navy Assembly Plant")
        assert h.region_id is None
        assert h.system_id is None
        assert h.station_id is None

    def test_optional_station(self):
        h = MarketHub(name="Amarr", region="Domain", solar_system="Amarr")
        assert h.station is None


class TestTaxonomy:
    def test_category_group_type(self):
        c = Category(category_id=1, name="Materials")
        g = Group(group_id=18, name="Mineral", category_id=1)
        assert c.category_id == 1
        assert g.name == "Mineral"


class TestFeeConfig:
    def test_defaults(self):
        f = FeeConfig()
        assert f.broker_fee == 0.0145
        assert f.sales_tax == 0.035


class TestUniverseEntities:
    def test_system_highsec_promotion(self):
        s = SolarSystem(system_id=30000142, name="Jita", region_id=10000002,
                        security_status=0.946, is_highsec=True)
        assert s.is_highsec is True
        assert s.security_status == pytest.approx(0.946)

    def test_station_model(self):
        st = Station(station_id=60003760, name="Jita 4-4", system_id=30000142, has_market=True)
        assert st.has_market is True

    def test_region_model(self):
        r = Region(region_id=10000002, name="The Forge")
        assert r.name == "The Forge"


class TestTradingOpportunity:
    def test_construct_with_engine_fields(self):
        op = TradingOpportunity(
            type_id=34, type_name="Tritanium", group="Mineral", category="Materials",
            buy_region_id=10000002, buy_region="The Forge",
            sell_region_id=10000003, sell_region="Domain",
            buy_price=3.90, sell_price=5.00, available_volume=4500,
            max_trade_quantity=500, quantity=500, capital_required=500 * 3.9 * 1.0145,
            purchase_cost=500 * 3.9, broker_cost=0, gross_revenue=2500,
            sales_tax_cost=87.5, total_cost=0, net_profit=2000,
            profit_per_unit=4.0, roi=0.4, margin=0.2, is_profitable=True,
        )
        assert op.type_name == "Tritanium"
        assert op.is_profitable is True
        assert op.buy_region == "The Forge"
