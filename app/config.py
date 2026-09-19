"""Application configuration — single source of truth for fees, hubs, TTLs, ESI.

Loaded from ``config.yaml`` at the project root. Environment variables with the
``EVE_TRADE_`` prefix override scalar settings at load time. The mutable
user-facing values (fees, available_capital, default_hub) are re-persistable
so the UI can edit them (see ``update_settings``).

No business constant is hardcoded in the engine: every fee / threshold lives
here.  (Requirement sections 3, 5, 11, 16, 28.)
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field

# --- project paths -------------------------------------------------------
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH: Path = PROJECT_ROOT / "config.yaml"
DATA_DIR: Path = PROJECT_ROOT / "data"


class FeeSettings(BaseModel):
    """Trading fees (section 3). Configurable; never hardcoded in the engine."""

    broker_fee: float = Field(default=0.0145, ge=0.0, le=1.0)
    sales_tax: float = Field(default=0.035, ge=0.0, le=1.0)
    currency_precision: int = Field(default=2, ge=0, le=6)


class EsiSettings(BaseModel):
    """ESI client behaviour (section 18: rate-limit / retry / timeout)."""

    base_url: str = "https://esi.evetech.net/latest"
    datasource: str = "tranquility"
    user_agent: str = "eve-trade/0.1 (+https://github.com/avadis/eve-trade)"
    max_concurrent: int = Field(default=5, ge=1)
    request_delay_seconds: float = Field(default=0.05, ge=0.0)
    timeout_seconds: float = Field(default=30.0, ge=1.0)
    max_retries: int = Field(default=5, ge=0)
    retry_backoff_factor: float = Field(default=2.0)


class SyncSettings(BaseModel):
    """TTL strategy (section 16). Orders dynamic->short; universe static->long."""

    market_orders_ttl_seconds: int = Field(default=300, ge=1)
    universe_ttl_seconds: int = Field(default=86400, ge=1)
    market_history_ttl_seconds: int = Field(default=1200, ge=1)


class DatabaseSettings(BaseModel):
    path: str = "data/eve_trade.db"

    @property
    def resolved_path(self) -> Path:
        p = Path(self.path)
        if not p.is_absolute():
            p = PROJECT_ROOT / p
        return p


class MarketHub(BaseModel):
    """A configurable market hub (section 5). Names resolve to IDs at runtime.

    ``region_id`` / ``system_id`` / ``station_id`` start empty and are filled by
    the universe sync. Until resolved, region-level analysis is used as a
    graceful fallback.
    """

    name: str
    region: str
    solar_system: str
    station: Optional[str] = None
    hub_type: str = "npc_hub"
    priority: int = 0
    region_id: Optional[int] = None
    system_id: Optional[int] = None
    station_id: Optional[int] = None


class AppConfig(BaseModel):
    fees: FeeSettings = Field(default_factory=FeeSettings)
    esi: EsiSettings = Field(default_factory=EsiSettings)
    sync: SyncSettings = Field(default_factory=SyncSettings)
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    market_hubs: list[MarketHub] = Field(default_factory=list)
    default_hub: str = "Jita"
    available_capital: float = Field(default=500_000_000.0, ge=0.0)
    target_scope: str = "highsec"  # highsec | all
    high_sec_threshold: float = Field(default=0.5, ge=-1.0, le=1.0)

    @property
    def default_hub_obj(self) -> MarketHub:
        for hub in self.market_hubs:
            if hub.name == self.default_hub:
                return hub
        raise ValueError(f"Default hub '{self.default_hub}' is not declared in market_hubs")

    def get_hub(self, name: str) -> MarketHub:
        for hub in self.market_hubs:
            if hub.name == name:
                return hub
        raise KeyError(name)


def _env_var(key: str) -> Optional[str]:
    return os.environ.get(f"EVE_TRADE_{key}")


def _config_file_path() -> Path:
    """Resolve the active config file path (env override > default)."""
    return Path(_env_var("CONFIG_FILE") or DEFAULT_CONFIG_PATH)


def load_config(path: Optional[os.PathLike[str] | str] = None) -> AppConfig:
    """Load configuration from a YAML file (path optional).

    Env overrides: EVE_TRADE_CONFIG_FILE, EVE_TRADE_BROKER_FEE,
    EVE_TRADE_SALES_TAX, EVE_TRADE_AVAILABLE_CAPITAL, EVE_TRADE_DEFAULT_HUB.
    """
    if path is None:
        path = _env_var("CONFIG_FILE") or DEFAULT_CONFIG_PATH
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    cfg = AppConfig(**data)

    if (v := _env_var("BROKER_FEE")):
        cfg.fees.broker_fee = float(v)
    if (v := _env_var("SALES_TAX")):
        cfg.fees.sales_tax = float(v)
    if (v := _env_var("AVAILABLE_CAPITAL")):
        cfg.available_capital = float(v)
    if (v := _env_var("DEFAULT_HUB")):
        cfg.default_hub = v
    return cfg


def _write_config(cfg: AppConfig, path: Path) -> None:
    """Persist the (possibly user-edited) settings back to YAML."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(cfg.model_dump(mode="json"), sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


_settings: Optional[AppConfig] = None


def get_settings(reload: bool = False) -> AppConfig:
    global _settings
    if _settings is None or reload:
        _settings = load_config()
    return _settings


def reload_settings() -> AppConfig:
    return get_settings(reload=True)


def update_settings(**changes: object) -> AppConfig:
    """Apply runtime edits from the UI and persist them to config.yaml.

    Recognized keys: broker_fee, sales_tax, available_capital, default_hub.
    """
    cfg = get_settings(reload=True)
    if "broker_fee" in changes:
        cfg.fees.broker_fee = float(changes["broker_fee"])
    if "sales_tax" in changes:
        cfg.fees.sales_tax = float(changes["sales_tax"])
    if "available_capital" in changes:
        cfg.available_capital = float(changes["available_capital"])
    if "default_hub" in changes:
        cfg.default_hub = str(changes["default_hub"])
    _write_config(cfg, _config_file_path())
    global _settings
    _settings = cfg
    return cfg


def persist_settings(cfg: Optional[AppConfig] = None) -> AppConfig:
    """Write the current settings back to ``config.yaml``.

    Used by the universe sync to persist the hub ids resolved from names
    (``region_id`` / ``system_id`` / ``station_id``) so later runs work offline.
    """
    cfg = cfg if cfg is not None else get_settings()
    _write_config(cfg, _config_file_path())
    _settings = cfg
    return cfg

