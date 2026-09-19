"""EVE Trade — tableau de bord Streamlit.

Visualise les données collectées par les scripts de sync (``sync_universe.py``,
``sync_market.py``) et simule des trades avec le moteur financier pur
(``app.engine``).  Lecture seule de la base locale SQLite — aucun appel ESI
depuis le dashboard ; le bouton « Rafraîchir » relit simplement le miroir local.

Lancement :
    python -m streamlit run dashboard.py
"""
from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from app.config import get_settings, update_settings
from app.db import get_db
from app.engine import PriceLadder, ProfitCalculator, QuantityCalculator

st.set_page_config(page_title="EVE Trade", page_icon="🚀", layout="wide")

MIRROR_TTL = 30  # s — le miroir local est relit toutes les 30 s max


# ---------------------------------------------------------------------------
# Chargement des données (cache local ; la DB est le miroir ESI, jamais ESI)
# ---------------------------------------------------------------------------
@st.cache_data(ttl=MIRROR_TTL)
def table_counts() -> dict[str, int]:
    db = get_db()
    out: dict[str, int] = {}
    for table in ("market_orders", "types", "regions", "solar_systems",
                  "stations", "opportunities", "esi_cache"):
        row = db.fetchone(f"SELECT COUNT(*) AS n FROM {table}")  # noqa: S608
        out[table] = int(row["n"]) if row else 0
    return out


@st.cache_data(ttl=MIRROR_TTL)
def known_types() -> list[dict]:
    """Types nommés dans la DB + ids présents dans les ordres (fallback '?')."""
    db = get_db()
    named = db.fetchall("SELECT type_id, name FROM types")
    extra = db.fetchall(
        "SELECT DISTINCT type_id FROM market_orders "
        "WHERE type_id NOT IN (SELECT type_id FROM types)")
    rows = [dict(r) for r in named]
    rows += [{"type_id": int(r["type_id"]), "name": None} for r in extra]
    rows.sort(key=lambda r: r["type_id"])
    return rows


@st.cache_data(ttl=MIRROR_TTL)
def order_book(region_id: int, type_id: int) -> dict:
    """Carnet d'ordres local + échelles de prix agrégées (moteur pur)."""
    rows = get_db().fetchall(
        "SELECT * FROM market_orders WHERE region_id=? AND type_id=? ORDER BY price",
        (region_id, type_id))
    sells = [(r["price"], r["volume_remain"]) for r in rows if not r["is_buy_order"]]
    buys = [(r["price"], r["volume_remain"]) for r in rows if r["is_buy_order"]]
    return {
        "raw": [dict(r) for r in rows],
        "sell_levels": PriceLadder.aggregate(sells, descending=False),
        "buy_levels": PriceLadder.aggregate(buys, descending=True),
    }


@st.cache_data(ttl=MIRROR_TTL)
def last_sync(region_id: int, type_id: int) -> dict | None:
    row = get_db().fetchone(
        "SELECT * FROM order_sync_meta WHERE region_id=? AND type_id=? AND side='all'",
        (region_id, type_id))
    return dict(row) if row else None


@st.cache_data(ttl=MIRROR_TTL)
def saved_opportunities(limit: int = 100) -> list[dict]:
    return get_db().get_opportunities(limit=limit)


# ---------------------------------------------------------------------------
# Formatage
# ---------------------------------------------------------------------------
def fmt_isk(value: float, prec: int = 2) -> str:
    text = f"{value:,.{prec}f}"
    return text.replace(",", "\u202f").replace(".", ",") + "\u202fISK"


def fmt_pct(value: float) -> str:
    return f"{value * 100:,.2f}".replace(",", "\u202f").replace(".", ",") + "\u202f%"


def fmt_age(iso_ts: str | None) -> str:
    if not iso_ts:
        return "jamais"
    dt = datetime.fromisoformat(iso_ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    seconds = max(0, (datetime.now(timezone.utc) - dt).total_seconds())
    if seconds < 90:
        return f"il y a {int(seconds)}\u202fs"
    if seconds < 5400:
        return f"il y a {seconds / 60:.0f}\u202fmin"
    return f"il y a {seconds / 3600:.1f}\u202fh"


# == SIDEBAR ================================================================
config = get_settings()
db = get_db()

with st.sidebar:
    st.header("⚙️ Paramètres")
    hub_names = [h.name for h in config.market_hubs]
    default_hub = config.default_hub if config.default_hub in hub_names else hub_names[0]
    hub_name = st.selectbox("Hub", hub_names, index=hub_names.index(default_hub))
    hub = next(h for h in config.market_hubs if h.name == hub_name)

    types = known_types()
    type_label = {int(t["type_id"]): (t["name"] or f"? (id {t['type_id']}')")
                  for t in types}
    type_id = st.selectbox("Objet", sorted(type_label),
                           format_func=lambda tid: type_label[tid])

    st.divider()
    st.subheader("Capital & frais")
    capital = st.number_input("Capital disponible (ISK)", min_value=0.0,
                              value=float(config.available_capital), step=10_000_000.0)
    broker_fee = st.number_input("Frais de courtage", min_value=0.0, max_value=0.2,
                                 value=float(config.fees.broker_fee), step=0.001,
                                 format="%.4f")
    sales_tax = st.number_input("Taxe de vente", min_value=0.0, max_value=0.2,
                                value=float(config.fees.sales_tax), step=0.001,
                                format="%.4f")
    if st.button("💾 Enregistrer dans config.yaml"):
        update_settings(available_capital=capital, broker_fee=broker_fee,
                        sales_tax=sales_tax, default_hub=hub_name)
        st.success("Config enregistrée.")

    st.divider()
    if st.button("🔄 Rafraîchir", use_container_width=True):
        st.cache_data.clear()
        st.rerun()
    st.caption(f"Miroir local : {config.database.path} — aucune requête ESI ici.")

# == PAGE ===================================================================
st.title(f"🚀 EVE Trade — {hub_name}")
if hub.region_id:
    st.caption(f"Région {hub.region_id} · système {hub.system_id}"
               + (f" · station {hub.station_id}" if hub.station_id
                  else " · station non résolue"))
else:
    st.warning("Hub non résolu — lancez `python sync_universe.py --hubs --with-stations`.")

counts = table_counts()
m1, m2, m3, m4 = st.columns(4)
m1.metric("Ordres en DB", f"{counts['market_orders']:,}")
m2.metric("Types nommés", f"{counts['types']:,}")
m3.metric("Systèmes", f"{counts['solar_systems']:,}")
m4.metric("Entrées cache ESI", f"{counts['esi_cache']:,}")

book = order_book(hub.region_id or 0, int(type_id))
sync_info = last_sync(hub.region_id or 0, int(type_id))

sell_levels = book["sell_levels"]
buy_levels = book["buy_levels"]
best_sell = sell_levels[0].price if sell_levels else None
best_buy = buy_levels[0].price if buy_levels else None

st.divider()
st.subheader(f"Carnet d'ordres — {type_label[int(type_id)]}")
if sync_info:
    st.caption(f"Dernière sync : {fmt_age(sync_info['captured_at'])} "
               f"(expire {fmt_age(sync_info['expires_at'])})")
else:
    st.caption("Pas encore de snapshot pour ce couple région/objet — "
               "lancez `python sync_market.py --types <id>`.")

c1, c2, c3, c4 = st.columns(4)
c1.metric("Meilleur sell", fmt_isk(best_sell) if best_sell else "—")
c2.metric("Meilleur buy", fmt_isk(best_buy) if best_buy else "—")
if best_sell and best_buy:
    spread = best_sell - best_buy
    c3.metric("Spread", fmt_isk(spread))
    c4.metric("Spread %", fmt_pct(spread / best_sell))
else:
    c3.metric("Spread", "—")
    c4.metric("Spread %", "—")

# -- graphique du carnet (échelles de prix, profondeur cumulée) --------------
if sell_levels or buy_levels:
    fig = go.Figure()
    if sell_levels:
        fig.add_trace(go.Scattergl(
            x=[lv.price for lv in sell_levels], y=[lv.cumulative for lv in sell_levels],
            name="Vente (prix croissant)", mode="lines", line=dict(color="#ff4d4d")))
        fig.add_trace(go.Bar(
            x=[lv.price for lv in sell_levels], y=[lv.volume for lv in sell_levels],
            name="Volume vente", yaxis="y2", marker_color="#ff4d4d", opacity=0.25))
    if buy_levels:
        fig.add_trace(go.Scattergl(
            x=[lv.price for lv in buy_levels], y=[lv.cumulative for lv in buy_levels],
            name="Achat (prix décroissant)", mode="lines", line=dict(color="#4d8dff")))
        fig.add_trace(go.Bar(
            x=[lv.price for lv in buy_levels], y=[lv.volume for lv in buy_levels],
            name="Volume achat", yaxis="y2", marker_color="#4d8dff", opacity=0.25))
    fig.update_layout(
        template="plotly_dark", height=420, margin=dict(l=10, r=10, t=30, b=10),
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        xaxis=dict(title="Prix (ISK)"),
        yaxis=dict(title="Volume cumulé"),
        yaxis2=dict(title="Volume / niveau", overlaying="y", side="right",
                    showgrid=False),
    )
    st.plotly_chart(fig, use_container_width=True)
else:
    st.info("Aucun ordre local pour cette sélection.")

# -- simulation de trade (moteur pur : sections 9/10/11) ---------------------
st.divider()
st.subheader("Simulateur de trade")
if sell_levels and buy_levels:
    total_sell_volume = sum(lv.volume for lv in sell_levels)

    qty = QuantityCalculator.compute(best_sell, total_sell_volume,
                                     capital, broker_fee)
    fill = PriceLadder.fill(sell_levels, qty.max_trade_quantity)
    eff_buy = fill.effective_price
    disposal = PriceLadder.fill(buy_levels, fill.filled_quantity)
    eff_sell = disposal.effective_price
    profit = ProfitCalculator.compute(eff_buy, eff_sell, disposal.filled_quantity,
                                      broker_fee, sales_tax)

    if profit.is_profitable:
        st.success(f"Trade rentable : {fmt_isk(profit.net_profit)} net "
                   f"sur {profit.quantity:,} unités".replace(",", " "))
    else:
        st.warning("Pas de profit avec les ordres locaux actuels.")

    p1, p2, p3, p4, p5 = st.columns(5)
    p1.metric("Qté tradable (capital × volume)", f"{qty.max_trade_quantity:,}")
    p2.metric("Prix d'achat moyen", fmt_isk(eff_buy))
    p3.metric("Prix de revente moyen", fmt_isk(eff_sell))
    p4.metric("Profit net", fmt_isk(profit.net_profit))
    p5.metric("ROI", fmt_pct(profit.roi))

    d1, d2, d3, d4 = st.columns(4)
    d1.metric("Coût d'achat", fmt_isk(profit.purchase_cost))
    d2.metric("Frais de courtage", fmt_isk(profit.broker_cost))
    d3.metric("Taxe de vente", fmt_isk(profit.sales_tax_cost))
    d4.metric("Marge", fmt_pct(profit.margin))
else:
    st.info("Simulation impossible : il faut à la fois des ordres de vente et d'achat.")

# -- opportunités sauvegardées ------------------------------------------------
st.divider()
st.subheader("Opportunités enregistrées")
opps = saved_opportunities(limit=50)
if opps:
    st.dataframe(pd.DataFrame(opps), use_container_width=True, hide_index=True)
else:
    st.caption("Aucune opportunité enregistrée — la table se remplira via le "
               "moteur d'analyse (section suivante du projet).")