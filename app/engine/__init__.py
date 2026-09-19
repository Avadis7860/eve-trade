"""Pure financial engine for eve-trade.

Each module is dependency-free and operates on primitives so it can be unit
tested in isolation and reused by any UI/backend. (Requirement sections 9, 25.)

The application layer (services / API) reads fees from ``app.config`` and passes
them here as parameters — the engine knows nothing about configuration.
"""
from app.engine.fee import FeeCalculator, FeeBreakdown  # noqa: F401
from app.engine.profit import ProfitCalculator, ProfitResult  # noqa: F401
from app.engine.quantity import QuantityCalculator, QuantityResult  # noqa: F401
from app.engine.ladder import PriceLadder, PriceLevel, Fill  # noqa: F401

__all__ = [
    "FeeCalculator",
    "FeeBreakdown",
    "ProfitCalculator",
    "ProfitResult",
    "QuantityCalculator",
    "QuantityResult",
    "PriceLadder",
    "PriceLevel",
    "Fill",
]
