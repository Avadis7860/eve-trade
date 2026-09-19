"""Domain models for eve-trade.

Pydantic models for ESI-derived entities and analysis results.  They are the
shared vocabulary between the data layer (SQLite), the services and the API.
The pure financial engine (app.engine) deliberately takes *primitives* (floats
/ ints / tuples) so it has zero knowledge of these models or of the UI.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class MarketOrder(BaseModel):
    """A single buy or sell order as returned by GET /markets/{region}/orders/."""

    model_config = ConfigDict(populate_by_name=True)

    order_id: int
    type_id: int
    price: float
    volume_remain: int
    volume_total: int
    is_buy_order: bool
    location_id: int
    system_id: int
    order_range: str = Field(alias="range")  # station | region | solarsystem | 1..40
    issued: str
    duration: int
    region_id: int


class EveType(BaseModel):
    """Item type (universe taxonomy leaf)."""

    type_id: int
    name: str
    group_id: int
    category_id: Optional[int] = None
    volume: float = 0.0
    packaged_volume: Optional[float] = None
    portion_size: int = 1
    published: bool = True
    market_group_id: Optional[int] = None


class Category(BaseModel):
    """Universe category (top of Category→Group→Type browsing, section 7)."""

    category_id: int
    name: str
    group_ids: list[int] = Field(default_factory=list)


class Group(BaseModel):
    """Universe group (mid level of the taxonomy)."""

    group_id: int
    name: str
    category_id: int
    type_ids: list[int] = Field(default_factory=list)


class Region(BaseModel):
    region_id: int
    name: str
    description: Optional[str] = None


class SolarSystem(BaseModel):
    system_id: int
    name: str
    region_id: int
    constellation_id: Optional[int] = None
    security_status: float = 0.0
    is_highsec: bool = False


class Station(BaseModel):
    """NPC station (structures require auth → out of scope for v1 public data)."""

    station_id: int
    name: str
    system_id: int
    type_id: Optional[int] = None
    has_market: bool = False


class MarketHub(BaseModel):
    """A configurable market hub (section 5).

    Names are the source of truth; region_id/system_id/station_id are resolved
    at universe-sync time (never hardcoded — see live validation where guessed
    IDs were wrong).
    """

    name: str
    region: str
    region_id: Optional[int] = None
    solar_system: str
    system_id: Optional[int] = None
    station: Optional[str] = None
    station_id: Optional[int] = None
    priority: int = 0
    hub_type: str = "npc_hub"


class FeeConfig(BaseModel):
    """Snapshot of fees used for an opportunity (for auditability)."""

    broker_fee: float = 0.0145
    sales_tax: float = 0.035


class MarketDepth(BaseModel):
    """Liquidity summary at the top of the book (section 13)."""

    best_price: Optional[float] = None
    volume_at_best: int = 0
    total_available: int = 0
    order_count: int = 0


class TradingOpportunity(BaseModel):
    """Final, UI-ready opportunity (section 8 & 22)."""

    type_id: int
    type_name: str
    group: str
    category: str

    buy_region_id: int
    buy_region: str
    sell_region_id: int
    sell_region: str

    buy_price: float          # effective acquisition price (ladder-aware)
    sell_price: float         # effective disposal price (ladder-aware)
    available_volume: int     # volume at the best opposite-side price
    max_trade_quantity: int   # bounded by market depth
    quantity: int             # effective trade quantity (min w/ capital)
    capital_required: float   # ISK needed to fund `quantity` units

    purchase_cost: float
    gross_revenue: float
    broker_cost: float
    sales_tax_cost: float
    total_cost: float
    net_profit: float
    profit_per_unit: float
    roi: float
    margin: float
    is_profitable: bool

    buy_depth: Optional[MarketDepth] = None
    sell_depth: Optional[MarketDepth] = None
    buy_location: Optional[str] = None
    sell_location: Optional[str] = None
    computed_at: str = ""


class AnalysisError(Exception):
    """Raised/known per-type error so the UI can surface *why* (section 19)."""
