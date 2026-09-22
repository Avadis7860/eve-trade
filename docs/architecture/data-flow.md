# Data Flow

Status: STABLE
Scope: major data paths
Source of truth: current imports and service boundaries

## Catalogue

`canonical JSON → CatalogValidator → CatalogRepository → UI/domain consumers → optional IndexedDB cache`.

## Universe

`canonical SDE graph JSON → UniverseGraphRepository → RouteIndex/RouteEngine → certification → inter-regional consumers`.

## Character ESI

`OAuth character session → route → CharacterEsiGateway → EsiGateway → ESI → EsiService → sync/application consumers`.

## Corporation ESI

`authenticated character → resolve corporation → CorporationEsiGateway → normalized corporation order/treasury data → ownership-aware application aggregation`.

## Trading

`market orders → canonical OrderId → ownership/scoping → opportunity/execution engines`.

## Financial Truth

`character transactions/execution refs → RealizedFinancialOutcomeEngine → FIFO allocations + fee state + completeness → TraderAnalyticsService projections`.

See [contracts](../contracts/) and [invariants](../invariants/) for normative semantics.
