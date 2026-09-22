# Services Architecture

Status: STABLE
Scope: application orchestration services
Source of truth: `src/services/`
Implementation: service classes/modules
Tests: service and engine tests named by domain
CI gate: unit/API/ESI/persistence gates as applicable

## Core services

- `EsiService` : frontend ESI semantics and normalization.
- `AuthService` : SSO/session token lifecycle.
- `IndexedDbStore` : durable local storage boundary.
- `MarketDataStore` : public market snapshot/cache orchestration.
- `GlobalMarketSync` : broad market synchronization.
- `CharacterTransactionSyncService` : wallet transaction ingestion.
- `ExecutionTrackingService` : execution attribution/tracking.
- `TraderAnalyticsService` : projections from Financial Truth.
- `MarketOutcomeTracker` : post-observation outcome tracking.
- `InterRegionalResolver` : certified universe/market route resolution.
- `CorporationTreasurySync` : corporation wallet/taxonomy synchronization.

Services orchestrate; they should not redefine canonical domain formulas or ownership semantics.
