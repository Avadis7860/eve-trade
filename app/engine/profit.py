"""Profit computation (section 9). Pure & deterministic.

purchase_cost   = buy_price  * quantity
broker_cost     = purchase_cost * broker_fee     (fee on buy-order placement)
gross_revenue   = sell_price * quantity
sales_tax_cost  = gross_revenue * sales_tax       (tax on selling into buy order)
total_cost      = purchase_cost + broker_cost + sales_tax_cost
net_profit      = gross_revenue - total_cost
profit_per_unit = net_profit / quantity
roi             = net_profit / total_cost
margin          = net_profit / gross_revenue
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ProfitResult:
    quantity: int
    purchase_cost: float
    broker_cost: float
    gross_revenue: float
    sales_tax_cost: float
    total_cost: float
    net_profit: float
    profit_per_unit: float
    roi: float
    margin: float
    is_profitable: bool


def _safe_div(num: float, den: float) -> float:
    return num / den if den else 0.0


class ProfitCalculator:
    """Section 9 finance engine. Takes primitives, returns a deterministic result."""

    @staticmethod
    def compute(purchase_price: float, sell_price: float, quantity: int,
                broker_fee: float, sales_tax: float) -> ProfitResult:
        q = max(0, int(quantity))
        purchase_cost = purchase_price * q
        broker_cost = purchase_cost * broker_fee
        gross_revenue = sell_price * q
        sales_tax_cost = gross_revenue * sales_tax
        total_cost = purchase_cost + broker_cost + sales_tax_cost
        net_profit = gross_revenue - total_cost
        return ProfitResult(
            quantity=q,
            purchase_cost=purchase_cost,
            broker_cost=broker_cost,
            gross_revenue=gross_revenue,
            sales_tax_cost=sales_tax_cost,
            total_cost=total_cost,
            net_profit=net_profit,
            profit_per_unit=_safe_div(net_profit, q),
            roi=_safe_div(net_profit, total_cost),
            margin=_safe_div(net_profit, gross_revenue),
            is_profitable=net_profit > 0,
        )
