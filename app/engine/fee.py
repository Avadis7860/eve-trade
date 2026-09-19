"""Fee calculation (section 9 & 3).

Pure, dependency-free. Rates are injected — never hardcoded here.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class FeeBreakdown:
    purchase_cost: float
    broker_fee: float
    broker_cost: float
    gross_revenue: float
    sales_tax: float
    sales_tax_cost: float
    total_cost: float


class FeeCalculator:
    """Broker fee (on acquisition) + sales tax (on disposal).

    Assumption (documented): acquisition is made by buying the lowest sell
    order (broker fee applies on the buy order) and disposal by selling into the
    highest buy order (sales tax applies on the sale). Both fees are applied
    on their natural side so both configurable rates participate.
    """

    @staticmethod
    def broker_cost(purchase_cost: float, broker_fee: float) -> float:
        return purchase_cost * broker_fee

    @staticmethod
    def sales_tax_cost(gross_revenue: float, sales_tax: float) -> float:
        return gross_revenue * sales_tax

    @staticmethod
    def total_cost(purchase_cost: float, broker_fee: float,
                   gross_revenue: float, sales_tax: float) -> float:
        return (purchase_cost
                + FeeCalculator.broker_cost(purchase_cost, broker_fee)
                + FeeCalculator.sales_tax_cost(gross_revenue, sales_tax))

    @staticmethod
    def breakdown(purchase_cost: float, broker_fee: float,
                  gross_revenue: float, sales_tax: float) -> FeeBreakdown:
        bc = FeeCalculator.broker_cost(purchase_cost, broker_fee)
        stc = FeeCalculator.sales_tax_cost(gross_revenue, sales_tax)
        return FeeBreakdown(
            purchase_cost=purchase_cost,
            broker_fee=broker_fee,
            broker_cost=bc,
            gross_revenue=gross_revenue,
            sales_tax=sales_tax,
            sales_tax_cost=stc,
            total_cost=purchase_cost + bc + stc,
        )
