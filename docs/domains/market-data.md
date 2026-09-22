# Market Data

Status: IMPLEMENTED
Scope: public market acquisition, quality and storage
Source of truth: `src/services/esi.ts`, `src/services/marketDataStore.ts`, `server/gateways/marketEsiGateway.ts`
Implementation: `EsiService.fetchLiveOrdersDetailed` and market store
Tests: market data quality, ESI gateway, route/inter-regional tests
CI gate: unit + ESI

## Current behavior

Public market orders are fetched through the backend ESI boundary. Orders are deduplicated by canonical `OrderId`. The service records freshness, completeness, validation and health signals.

Collection results distinguish complete, partial and empty outcomes; transport failures remain errors.

## Dependencies

Catalog truth for type identity, Universe truth for location identity, ESI transport and market persistence.

## Known limitations

Market opportunity quality depends on actual depth and observed turnover; predictive filtering is not a substitute for observed market evidence.
