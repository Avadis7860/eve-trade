# P0-B — Deterministic HTTP 429 / Retry-After Browser Coverage

Status: DONE / MERGED / CERTIFIED
Branch: `test/p0-market-429-retry-after` (historical; do not reuse)
Base: `main` at `c1f38b889adea1b16ea98b280f13c8fc72cca750`
Merge: PR #66 → `main` at `c0ddc69ef424ed0cfd4de776758166c3ee8c1abe`

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

## Certification history

- CI #703: product/browser lanes were executed; `Browser E2E — Operations` passed all 9 tests, including the HTTP 429 scenario, while the browser composition aggregator failed.
- The failed browser composition job did not expose retrievable logs through the repository connector; a failed-job rerun reproduced the same aggregator failure.
- CI #704 on the next commit failed in `CI / Change Scope` before lane selection, leaving the substantive validation lanes skipped. This is treated as CI/infrastructure evidence only, not as product behavior evidence.
- The branch was certified by CI #718 and SDE #479, then merged as PR #66. Post-merge Main Smoke #7 completed successfully on the resulting main commit.
