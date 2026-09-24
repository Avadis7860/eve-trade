# Known Gaps

Status: CURRENT
Scope: functional, semantic and operational gaps revalidated against the active UX-03 branch
Source of truth: code, tests, CI and current state documents

## Contract-reset findings

These findings are current and block dependent financial UX work:

- **Economic direction is not market order side.** A trader can acquire by taking an existing SELL order and later dispose through a SELL order of their own. Therefore `is_buy_order` is a market-mechanism fact, not the accounting direction.
- **Wallet transaction is the accounting fact.** An order ID is corroborating market provenance when available, not a required financial identity.
- **Order identity dimensions are already available.** The order model carries OrderId and ownership/provenance fields; Character and Corporation should remain scope/ownership dimensions rather than separate market-order entity classes.
- **No first-class position ledger exists yet.** FIFO lots are rebuilt locally by the current financial engine instead of being authoritative persisted position state.
- **Partial disposal semantics are too strong in analytics.** A sale of 1 unit from a 10,000-unit acquisition can produce realized P&L on 1 unit, but the underlying position remains OPEN/PARTIALLY_REALIZED. Current sale-sized TradeCycleRecord aggregation can still count that matched sale as a closed trade.
- **Incomplete history must remain incomplete.** Missing prior acquisition history must not be reconstructed from active BUY orders or from current order-book observations.

## UX / product gaps

- The UI information architecture still requires the UX-03/UX-04 financial contract reset before certification.
- Portfolio allocation scaffolding exists, but Real Portfolio cost basis and open-position exposure require the accepted AcquisitionLot / CurrentPosition model.
- Journal remains manual despite ESI-derived transaction/order-history/journal data being available.
- Parameters mix trading policy, logistics, treasury and technical maintenance.

## Market / ESI operational gaps

- Market/ESI failure semantics are explicit and certified.
- The legacy `EsiService.fetchLiveOrders()` helper remains a latent quality-loss hazard because it drops the quality envelope; no production caller is currently known.
- Rate-limit/cache-aware scheduling remains a product-level maintenance opportunity.
- Freshness, coverage and provenance still need cross-domain audit outside the already hardened Operations paths.

## Financial / data-quality gaps

- Some defensive numeric paths convert invalid/non-finite values to 0 inside financial calculations. DATA-001 must determine whether validation guarantees make this unreachable; if not, preserve explicit incomplete state instead.
- A “no cycles” analytics fallback currently labels realized profit as ESTIMATED. Absence of matched cycles is not evidence of an estimate and needs reclassification.
- Order-history fulfilled volume may be useful as activity evidence, but must never be used as acquisition cost basis or realized financial truth.
- Character Assets are not implemented; current inventory quantity/location coverage therefore cannot be assumed complete.

## CI / delivery gaps

- CI-003 / #76: current UX-03 head has a red Unit/Domain Certification lane caused by the new exact corporation-payload test harness and auth mocking interaction. Fix the harness only.
- CI-002 remains the separate Draft/Ready PR routing hardening item.
- Branch protection/ruleset configuration remains administratively unverified.

## Structural / deferred gaps

- IndexedDB decomposition remains deferred.
- Broad UI component decomposition remains deferred.
- Dedicated performance measurement remains deferred.
- Browser E2E expansion follows contract acceptance.

## Historical reclassification

Older audits mentioning duplicate corporation ESI paths, numeric OrderId risk or observer/owner confusion are not copied into active gaps unless fresh evidence supports them. The current order reset is narrower: one canonical order, explicit issuer/owner/observer axes, and strict separation from financial transaction direction.
