# Known Gaps

Status: CURRENT
Scope: functional and operational gaps revalidated against current main
Source of truth: code, tests, CI and current state documents

## UX / product gaps

- The UI information architecture does not yet reflect the mature trading workflow of discovery -> operations -> performance -> allocation -> cockpit.
- Operations remains a partial product surface, but the current browser decision-loop/lifecycle gate is closed for keep / adjust / relocate / cancel, active-order loading/empty, market CACHE/UNKNOWN, failed-refresh preservation and health-aware outbid filtering. Further UX-02 work remains around refresh coordination and broader source/row consistency coverage.
- Portfolio currently presents an allocation simulation but is fed from opportunities derived from the selected item, preventing genuine cross-item diversification.
- The Journal remains manual despite authoritative ESI-derived transaction/order-history/journal data being available.
- Parameters mix trading policy, logistics, treasury and technical maintenance; some visible controls have no demonstrated effective engine consumer.
- Cockpit is still too item-centric to act as an application-wide decision synthesis.

## Market / ESI operational gaps

- Target-PC public market-order retrieval is reported broken but remains NOT ROOT-CAUSED.
- Some non-Operations market acquisition paths may still swallow errors; the Operations order-sync path now surfaces explicit failure instead of presenting an ordinary empty state.
- Rate-limit/cache-aware scheduling for the public market-order group is not yet exposed as a product-level operational signal.
- Market-data freshness/completeness/source remain inconsistent across the application; Operations now exposes per-order health and age using the UX-01 vocabulary.

## Structural gaps

- IndexedDbStore remains a large monolithic service; decomposition is explicitly DEFERRED by the UX-first sequencing gate.
- Several UI files remain large; decomposition is explicitly DEFERRED until the relevant UX contracts are accepted.
- Performance is not protected by a dedicated measurement gate.
- Browser E2E must expand to cover critical trading workflows after UX contracts are frozen.

## Domain gaps

- Assets, inventory and logistics corporation domains are not implemented.
- Corporation trading UI scope remains less mature than the underlying ownership/ESI domain.
- Prediction/calibration depends on accumulating valid historical observations.

## Historical reclassification

Older audits may mention duplicate corporation ESI paths, numeric OrderId risk, observer/owner confusion or missing API tests. Those are historical after the stabilization sequence and must not be copied into the current backlog without fresh evidence.
