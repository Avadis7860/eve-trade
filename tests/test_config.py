"""Tests for app.config (section 3, 5, 11, 28 — configuration)."""
from __future__ import annotations

import os
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from app.config import (
    AppConfig,
    FeeSettings,
    MarketHub,
    load_config,
    persist_settings,
    reload_settings,
    update_settings,
)


# --- loading -------------------------------------------------------------
def test_loads_all_sections_from_yaml(tmp_config_path: Path):
    cfg = load_config(tmp_config_path)
    assert isinstance(cfg.fees, FeeSettings)
    assert cfg.target_scope == "highsec"
    assert len(cfg.market_hubs) == 2
    assert cfg.default_hub == "Jita"


def test_fees_match_spec_values(tmp_config_path: Path):
    cfg = load_config(tmp_config_path)
    # Section 3 hard requirements
    assert cfg.fees.broker_fee == pytest.approx(0.0145)
    assert cfg.fees.sales_tax == pytest.approx(0.035)


def test_hubs_resolvable_by_name(tmp_config_path: Path):
    cfg = load_config(tmp_config_path)
    assert cfg.get_hub("Jita").region == "The Forge"
    assert cfg.default_hub_obj.region_id is None  # not yet synced


def test_missing_config_file_raises(tmp_path: Path):
    missing = tmp_path / "nope.yaml"
    with pytest.raises(FileNotFoundError):
        load_config(missing)


# --- validation ----------------------------------------------------------
def test_fee_must_be_within_range():
    with pytest.raises(ValidationError):
        FeeSettings(broker_fee=-0.1)
    with pytest.raises(ValidationError):
        FeeSettings(sales_tax=1.5)


def test_empty_market_hubs_means_default_hub_unresolvable(tmp_path: Path, monkeypatch):
    p = tmp_path / "config.yaml"
    p.write_text("available_capital: 100\n", encoding="utf-8")
    monkeypatch.setenv("EVE_TRADE_CONFIG_FILE", str(p))
    cfg = load_config(p)
    with pytest.raises(ValueError):
        _ = cfg.default_hub_obj


# --- env overrides -------------------------------------------------------
def test_env_override_capital(tmp_config_path: Path, monkeypatch):
    monkeypatch.setenv("EVE_TRADE_AVAILABLE_CAPITAL", "250000000")
    cfg = load_config(tmp_config_path)
    assert cfg.available_capital == pytest.approx(250_000_000)


def test_env_override_fees(tmp_config_path: Path, monkeypatch):
    monkeypatch.setenv("EVE_TRADE_BROKER_FEE", "0.02")
    monkeypatch.setenv("EVE_TRADE_SALES_TAX", "0.04")
    cfg = load_config(tmp_config_path)
    assert cfg.fees.broker_fee == pytest.approx(0.02)
    assert cfg.fees.sales_tax == pytest.approx(0.04)


# --- runtime edit + persist ---------------------------------------------
def test_update_settings_persists(tmp_config_path: Path, monkeypatch):
    cfg = load_config(tmp_config_path)
    assert cfg.fees.broker_fee == pytest.approx(0.0145)

    updated = update_settings(broker_fee=0.01, available_capital=123_000_000)
    assert updated.fees.broker_fee == pytest.approx(0.01)
    assert updated.available_capital == pytest.approx(123_000_000)

    # re-load from disk -> change persisted
    cfg2 = load_config(tmp_config_path)
    assert cfg2.fees.broker_fee == pytest.approx(0.01)
    assert cfg2.available_capital == pytest.approx(123_000_000)


def test_persist_settings_writes_resolved_hub_ids(tmp_config_path: Path):
    """The universe sync fills hub ids, then persists them for offline runs."""
    cfg = load_config(tmp_config_path)
    hub = cfg.market_hubs[0]
    assert (hub.region_id, hub.system_id, hub.station_id) == (None, None, None)

    hub.region_id, hub.system_id, hub.station_id = 10000002, 30000142, 60003760
    persist_settings(cfg)

    written = yaml.safe_load(tmp_config_path.read_text(encoding="utf-8"))
    stored = written["market_hubs"][0]
    assert stored["name"] == "Jita"
    assert stored["region"] == "The Forge"          # names are preserved
    assert (stored["region_id"], stored["system_id"],
            stored["station_id"]) == (10000002, 30000142, 60003760)

    # A fresh load sees the ids, so hub resolution needs no ESI call any more.
    reloaded = load_config(tmp_config_path)
    jita = reloaded.get_hub("Jita")
    assert jita.region_id == 10000002
    assert jita.system_id == 30000142
    assert jita.station_id == 60003760
