# Known Gaps

Status: CURRENT
Scope: functional, semantic and operational gaps revalidated against the active UX-03 branch
Source of truth: code, tests, CI and current state documents

## Contract-reset findings

These findings are retained as durable model rules; ORD-001 and FIN-001 themselves are now certified.

- **Economic direction is not market order side.** A trader can acquire by taking an existing SELL order and later dispose through a SELL order of their own. Therefore `is_buy_order` is a market-mechanism fact, not the accounting direction.
- **Wallet transaction is the accounting fact.** An order ID is corroborating market provenance when available, not a required financial identity.
- **Order identity dimensions are already available.** The order model carries OrderId and ownership/provenance fields; Character and Corporation should remain scope/ownership dimensions rather than separate market-order entity classes.
- **No durable position store exists.** The certified position ledger is a deterministic calculation boundary over source transactions; persistence of AcquisitionLot/CurrentPosition is intentionally deferred.
- **Performance remains the next financial gate.** FIN-002 must finish the migration of all Performance/KPI consumers to position lifecycle semantics and ensure no legacy sale-sized metric remains authoritative.
- **Incomplete history must remain incomplete.** Missing prior acquisition history must not be reconstructed from active BUY orders or from current order-book observations.

## E2E UX findings — 2026-09-24

- **Operational character view of corporation orders:** the canonical ownership model is correct, but the current UI projection is too restrictive for a hub-isolation workflow. A corporation-owned order observed/issued by a character should be surfacable in that character's operational workflow without changing economic ownership.
- **Orders table density:** the current operational table can require horizontal scrolling before the most useful fields are simultaneously visible. User-controlled column visibility is required for a practical large-order workflow.
- **Portfolio information density:** repeated DATA_ISSUE cards and verbose per-row Evidence content consume disproportionate vertical/horizontal space. The UI should group repeated diagnostics and separate decision-critical allocation fields from secondary evidence/provenance details while preserving degraded-data semantics.

## UX / product gaps

- The UI information architecture still requires final UX-03/UX-04 financial certification. Manual E2E has additionally identified operational visibility and information-density follow-up.
- Portfolio allocation scaffolding can now consume the accepted position model, but final Real Portfolio exposure certification remains blocked by FIN-002 and the missing Assets source.
- Journal remains manual despite ESI-derived transaction/order-history/journal data being available.
- Parameters mix trading policy, logistics, treasury and technical maintenance.

## Market / ESI operational gaps

- Market/ESI failure semantics are explicit and certified.
- The legacy `EsiService.fetchLiveOrders()` helper remains a latent quality-loss hazard because it drops the quality envelope; no production caller is currently known.
- Rate-limit/cache-aware scheduling remains a product-level maintenance opportunity.
- Freshness, coverage and provenance still need cross-domain audit outside the already hardened Operations paths.

## Financial / data-quality gaps

- Some defensive numeric paths still convert invalid/non-finite values to 0 inside financial calculations; these remain candidates for the next data-quality hardening pass where evidence shows the conversion can be reached.
- A “no cycles” analytics fallback currently labels realized profit as ESTIMATED. Absence of matched cycles is not evidence of an estimate and needs reclassification.
- Order-history fulfilled volume may be useful as activity evidence, but must never be used as acquisition cost basis or realized financial truth.
- Character Assets are not implemented; current inventory quantity/location coverage therefore cannot be assumed complete.

## CI / delivery gaps

- CI status for the active branch is dynamic and must be read from the current PR #71 workflow runs.
- CI-002 remains the separate Draft/Ready PR routing hardening item.
- Branch protection/ruleset configuration remains administratively unverified.

## Structural / deferred gaps

- IndexedDB decomposition remains deferred.
- Broad UI component decomposition remains deferred.
- Dedicated performance measurement remains deferred.
- Browser E2E expansion follows contract acceptance.

## Historical reclassification

Older audits mentioning duplicate corporation ESI paths, numeric OrderId risk or observer/owner confusion are not copied into active gaps unless fresh evidence supports them. The current order reset is narrower: one canonical order, explicit issuer/owner/observer axes, and strict separation from financial transaction direction.
