"""eve-trade: EVE Online Trading Intelligence Dashboard.

Package racine. Expose `get_settings()` pour un accès global à la config.
"""
from app.config import get_settings  # noqa: F401  (re-export public)

__all__ = ["get_settings"]
__version__ = "0.1.0"
