# Current State

Status: CURRENT
Scope: current main + active working branch
Source of truth: code, tests, CI and manifests

## Current main baseline

Current main head remains `aec4c62691723e8fa2ee2bb2f9126249152ad57f` after PR #70. The UX-03 branch has not been merged and must not be treated as current main product truth.

The market/ESI retrieval reliability gate is closed and UX-02 Operations is merged/certified.

## Active working branch reality

The only active product branch is `ux-03/allocation-contract`, associated with PR #71. It is now **FROZEN FOR FEATURE DEVELOPMENT** pending a financial/order contract rebase.

The branch exposed these semantic gaps:

- market `is_buy_order` is a market-mechanism fact, not an economic acquisition/disposition fact;
- economic direction for accounting comes from transaction facts;
- active BUY orders are capital reservations/order exposure, not acquisition evidence;
- there is no first-class persisted AcquisitionLot / CurrentPosition ledger;
- the FIFO engine reconstructs lots locally and is therefore a useful calculation primitive, not the complete position boundary;
- a partial disposal can create a positive sale allocation while the underlying lot remains OPEN/PARTIALLY_REALIZED;
- current TradeCycleRecord/analytics can count sale-sized matched quantities as “closed trades”, which is too strong a lifecycle claim.

Priority issues:
- FIN-001 #72
- ORD-001 #73
- FIN-002 #74
- DATA-001 #75
- CI-003 #76

## Stable foundations

- canonical catalog and CCP SDE-backed universe;
- shared backend ESI transport with principal-aware gateway behavior;
- explicit collection quality states;
- canonical string OrderId;
- economic ownership separated from observing principal;
- certified market/ESI failure semantics;
- UX-02 Operations.

These foundations are not being discarded.

## Product reality

The current engine/domain layers remain ahead of the UI, but the financial boundary needs rework before the next UX certification.

- Global discovery remains the discovery surface.
- Operations remains the operational order surface.
- UX-03 allocation scaffolding exists, but Real Portfolio certification is blocked by the position/lot contract.
- Journal remains manual.
- Character Assets are not implemented; therefore current inventory coverage cannot be assumed complete.
- Performance analytics must be re-based before it is promoted as the authoritative historical view.

## Active gaps

- No first-class AcquisitionLot / CurrentPosition ledger.
- Position closure semantics are too close to sale-level allocation semantics.
- Market-order side, economic transaction direction, position lifecycle and realized financial state are not yet expressed as four clean axes throughout the stack.
- Provenance needs an audit across aggregation paths.
- Some numeric defensive fallbacks still convert invalid/missing values to zero inside financial calculations and must be audited under DATA-001.

## Sequencing

Financial/order contract rebase comes first. UX-03 resumes after FIN-001/ORD-001/FIN-002/DATA-001. UX-04 then consumes the accepted financial lifecycle rather than defining its own accounting semantics.

