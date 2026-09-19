"""Shared pytest fixtures.

Provides a throw-away config file (in tmp_path) so tests never touch the
real ``config.yaml``, plus a writable app config override via env var.
"""
from __future__ import annotations

from pathlib import Path

import pytest

TEST_CONFIG = """\
fees:
  broker_fee: 0.0145
  sales_tax: 0.035
  currency_precision: 2
available_capital: 500000000.0
default_hub: Jita
target_scope: highsec
high_sec_threshold: 0.5
market_hubs:
  - name: Jita
    region: The Forge
    solar_system: Jita
    station: "Jita IV - Moon 4 - Caldari Navy Assembly Plant"
    priority: 1
    hub_type: npc_hub
  - name: Amarr
    region: Domain
    solar_system: Amarr
    priority: 2
    hub_type: npc_hub
esi:
  base_url: "https://esi.evetech.net/latest"
  datasource: tranquility
  user_agent: "eve-trade/test"
  max_concurrent: 5
  request_delay_seconds: 0.0
  timeout_seconds: 10
  max_retries: 2
  retry_backoff_factor: 2.0
sync:
  market_orders_ttl_seconds: 300
  universe_ttl_seconds: 86400
  market_history_ttl_seconds: 1200
database:
  path: "data/eve_trade.db"
"""


@pytest.fixture
def tmp_config_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Write a test config.yaml to a temp dir and point the loader at it."""
    p = tmp_path / "config.yaml"
    p.write_text(TEST_CONFIG, encoding="utf-8")
    # Isolate from the real config + any leftover env overrides.
    monkeypatch.setenv("EVE_TRADE_CONFIG_FILE", str(p))
    for k in ("BROKER_FEE", "SALES_TAX", "AVAILABLE_CAPITAL", "DEFAULT_HUB"):
        monkeypatch.delenv(f"EVE_TRADE_{k}", raising=False)
    return p


@pytest.fixture(autouse=True)
def _reset_settings_singleton():
    """Drop the in-memory settings cache so tests never leak config state."""
    import app.config as _cfg

    _cfg._settings = None
    yield
    _cfg._settings = None


@pytest.fixture
def tmp_data_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Return a path to a fresh SQLite db inside the temp dir, env-isolated."""
    db_path = tmp_path / "test_eve_trade.db"
    cfg = tmp_path / "config.yaml"
    cfg.write_text(TEST_CONFIG, encoding="utf-8")
    monkeypatch.setenv("EVE_TRADE_CONFIG_FILE", str(cfg))
    return db_path
