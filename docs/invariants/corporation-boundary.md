# CORPORATION-BOUNDARY-001

Status: STABLE
Scope: corporation authorization and economic boundaries
Implementation: `server/gateways/corporationEsiGateway.ts`, `src/services/corporationTreasurySync.ts`
Validation: corporation gateway/architecture + treasury tests
CI gate: corporation boundary

## Rule

Corporation data is accessed using the authenticated character principal; corporation identity remains a separate economic identifier.

## Failure Mode

Synthetic corporation credentials, credential leakage, or corporation capital silently treated as character capital.

## Enforcement

Corporation gateway methods require valid character/corporation identity and a non-empty character credential. Treasury provenance distinguishes ESI, manual and unavailable capital.

## Regression Coverage

Distinct credentials for multiple characters, corporation X/Y separation, wallet division handling and fail-closed behavior.
