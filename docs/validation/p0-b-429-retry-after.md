# P0-B — Deterministic HTTP 429 / Retry-After Browser Coverage

Status: IMPLEMENTED — PENDING CI CERTIFICATION
Branch: `test/p0-market-429-retry-after`
Base: `main` at `c1f38b889adea1b16ea98b280f13c8fc72cca750`

## Scenario

The existing deterministic E2E harness controls the market mock through:

`POST /__control__/market { "mode": "error", "errorStatus": 429 }`

For a fatal market response it returns:

- HTTP 429;
- `X-Cache-Status: MISS`;
- `X-Pages: 1`;
- `X-ESI-Error-Limit-Remain: 91`;
- `X-ESI-Error-Limit-Reset: 42`;
- `Retry-After: 7`.

No real CCP/ESI behavior is inferred from this mock.

## Browser proof

`tests/e2e/operations-browser.spec.ts` now includes a deterministic 429 scenario that:

1. prepares the Operations fixture in market error mode;
2. completes the deterministic SSO flow;
3. waits for the browser market request to `/api/markets/10000002/orders`;
4. asserts the actual response status is HTTP 429;
5. asserts canonical market `ERROR`;
6. asserts `HTTP 429` is visible;
7. asserts the market health accessible label contains `cache MISS`, `budget ESI 91` and `retry 7s`;
8. asserts active order rows remain visible;
9. asserts the false empty-state message is absent;
10. asserts the decision gate remains unavailable.

## Expected invariant

HTTP 429 is a market retrieval failure, not an empty market.

The browser must retain the active order context while exposing the failure diagnostics. The test is intentionally deterministic and does not depend on CCP availability, wall-clock timing or a real rate-limit event.

## Completion gate

P0-B is complete only after:

- the single PR containing this test is CI-certified green;
- relevant browser/required-gate jobs are verified;
- the PR is merged;
- post-merge Main Smoke is green;
- the P0 documentation remains synchronized.

The target-PC incident remains NOT ROOT-CAUSED independently of this deterministic test.
