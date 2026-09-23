import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 43123);
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`;

const ALPHA = {
  id: 1001,
  name: 'E2E Character Alpha',
};

async function openOrders(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Ordres/ }).click();
  await expect(
    page.getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' }),
  ).toBeVisible();
}

async function selectAppCallback(page: Page): Promise<void> {
  await page.getByText('Application actuelle').click();
}

async function resetFixture(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__control__/reset`);
  expect(response.ok()).toBeTruthy();
}

async function setCharacterOrdersMode(
  request: APIRequestContext,
  mode: 'populated' | 'empty',
): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__control__/orders`, {
    data: { mode },
  });
  expect(response.ok()).toBeTruthy();
}

async function blockMarketOrderRequests(page: Page): Promise<void> {
  await page.route('**/api/markets/*/orders?*', async route => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'TEST_MARKET_TRANSPORT_BLOCKED' }),
    });
  });
}

async function setMarketMode(
  request: APIRequestContext,
  mode: 'live' | 'error' | 'partial',
  errorStatus: 401 | 403 | 429 | 500 = 401,
): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__control__/market`, {
    data: { mode, errorStatus },
  });
  expect(response.ok()).toBeTruthy();
}

async function launchSso(page: Page): Promise<void> {
  await selectAppCallback(page);
  const authResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/url') &&
    response.request().method() === 'GET',
  );
  const popupPromise = page.waitForEvent('popup');

  await page
    .getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' })
    .click();

  const [authResponse, popup] = await Promise.all([authResponsePromise, popupPromise]);
  expect(authResponse.ok()).toBeTruthy();

  await popup.waitForURL(/\/auth\/callback\?/, {
    waitUntil: 'commit',
    timeout: 15_000,
  });

  await expect(
    page.getByRole('banner').getByText(ALPHA.name, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await popup.close();
}

async function setOperationsScenario(
  request: APIRequestContext,
  scenario: 'default' | 'keep' | 'adjust' | 'relocate' | 'cancel',
): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__control__/operations`, {
    data: { scenario },
  });
  expect(response.ok()).toBeTruthy();
}

async function prepareOperations(
  page: Page,
  request: APIRequestContext,
  mode: 'live' | 'error' | 'partial',
  scenario: 'default' | 'keep' | 'adjust' | 'relocate' | 'cancel' = 'default',
): Promise<void> {
  await setMarketMode(request, mode);
  await setOperationsScenario(request, scenario);
  await page.goto('/');
  await openOrders(page);
}

async function expectOperationsLoaded(page: Page): Promise<void> {
  await expect(page.getByText('Ordres actifs', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('button', { name: 'Sync Marché des Ordres' }),
  ).toBeEnabled({ timeout: 15_000 });
}

test.describe('UX-02 — Operations / Mes Ordres', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixture(request);
  });

  test.afterEach(async ({ request }) => {
    await resetFixture(request);
  });

  test('shows a distinct loading state while active orders are being fetched', async ({ page, request }) => {
    await prepareOperations(page, request, 'live');

    const ordersUrl = `**/api/character/${ALPHA.id}/orders`;
    await page.route(ordersUrl, async route => {
      await new Promise(resolve => setTimeout(resolve, 700));
      await route.continue();
    });

    await launchSso(page);
    await expect(page.getByText('Chargement des ordres actifs…', { exact: true })).toBeVisible();
    await expectOperationsLoaded(page);
    await page.unroute(ordersUrl);
  });

  test('shows a distinct successful empty state for active orders', async ({ page, request }) => {
    await setCharacterOrdersMode(request, 'empty');
    await prepareOperations(page, request, 'live');
    await launchSso(page);

    await expect(
      page.getByText('Aucun ordre actif n’est connu dans cette portée.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync Marché des Ordres' })).toBeDisabled();
  });

  test('exposes the operational decision context for a real active order fixture', async ({ page, request }) => {
    await prepareOperations(page, request, 'live');
    await launchSso(page);
    await expectOperationsLoaded(page);

    await expect(page.getByText('Liquidités', { exact: true })).toBeVisible();
    await expect(page.getByText('Escrow', { exact: true })).toBeVisible();
    await expect(page.getByText('Capital immobilisé', { exact: true })).toBeVisible();
    await expect(page.getByText('Actions requises', { exact: true })).toBeVisible();
    await expect(page.getByText('Risque d’expiration', { exact: true })).toBeVisible();

    await expect(page.getByText('LIVE', { exact: true }).first()).toBeVisible();

    await page.locator('tbody tr').first().click();
    await expect(
      page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' }),
    ).toBeVisible();
    await expect(page.getByText('Provenance / ownership', { exact: true })).toBeVisible();
    await expect(page.getByText('Dernière observation marché', { exact: true })).toBeVisible();
    await expect(page.getByText('Résultat attendu restant', { exact: true })).toBeVisible();
    await expect(page.getByText('Décision Operations', { exact: true })).toBeVisible();
    await expect(page.getByText('Âge', { exact: true })).toBeVisible();
  });

  test('keeps row and detail values consistent for the same active order', async ({ page, request }) => {
    await prepareOperations(page, request, 'live', 'adjust');
    await launchSso(page);
    await expectOperationsLoaded(page);

    const firstRow = page.locator('tbody tr').first();
    const cells = firstRow.locator('td');
    const owner = (await cells.nth(0).locator('div').first().innerText()).trim();
    const item = (await cells.nth(2).locator('div').nth(1).locator('div').first().innerText()).trim();
    const location = (await cells.nth(3).locator('div').first().innerText()).trim();
    const remaining = (await cells.nth(5).locator('span').first().innerText()).trim();
    const health = (await cells.nth(9).locator('span.inline-flex').innerText()).trim();

    await expect(firstRow.getByText(/Ajuster :/)).toBeVisible();
    await firstRow.click();

    const detail = page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' });
    await expect(detail).toBeVisible();
    await expect(detail.getByText(item, { exact: true })).toBeVisible();
    await expect(detail.getByText(location, { exact: true })).toBeVisible();
    await expect(detail.getByText(owner, { exact: true })).toBeVisible();
    await expect(detail.getByText(health, { exact: true }).first()).toBeVisible();
    await expect(detail.getByText(new RegExp('reliquat\\s+' + remaining + '\\b'))).toBeVisible();
    await expect(detail.getByText(/Ajuster le Prix à/)).toBeVisible();
  });

  test('exposes CACHE as an actionable health state', async ({ page, request }) => {
    await prepareOperations(page, request, 'error');
    await blockMarketOrderRequests(page);
    await launchSso(page);
    await expectOperationsLoaded(page);

    await page.evaluate(async () => {
      const { GlobalMarketSyncService } = await import('/src/services/globalMarketSync.ts');
      GlobalMarketSyncService.stop();
    });

    await page.evaluate(async () => {
      const { MarketDataStore } = await import('/src/services/marketDataStore.ts');
      MarketDataStore.setOrders(34, 10000002, [{
        order_id: 'cache-competitor',
        type_id: 34,
        region_id: 10000002,
        system_id: 30000142,
        location_id: 60003760,
        price: 95,
        volume_remain: 25,
        volume_total: 25,
        min_volume: 1,
        is_buy_order: false,
        range: 'region',
        issued: '2026-09-23T00:00:00.000Z',
        duration: 90,
      }], false);
      MarketDataStore.notifyListeners();
    });

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow.getByText('CACHE', { exact: true })).toBeVisible();
    await expect(firstRow.getByText(/Ajuster :|Conserver|Déplacer ➔|Annuler l'Ordre/)).toBeVisible();

    await firstRow.click();
    const detail = page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' });
    await expect(detail.locator('span.inline-flex').filter({ hasText: 'CACHE' })).toBeVisible();
    await expect(detail.getByText(/Aucune recommandation fiable n’est produite/)).toHaveCount(0);
  });

  test('keeps an order UNKNOWN and non-actionable when market state is absent', async ({ page, request }) => {
    await prepareOperations(page, request, 'error');
    await blockMarketOrderRequests(page);
    await launchSso(page);
    await expectOperationsLoaded(page);

    await page.evaluate(async () => {
      const { GlobalMarketSyncService } = await import('/src/services/globalMarketSync.ts');
      GlobalMarketSyncService.stop();
    });

    await page.evaluate(async () => {
      const { MarketDataStore } = await import('/src/services/marketDataStore.ts');
      MarketDataStore.clearStore();
    });

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow.getByText('UNKNOWN', { exact: true })).toBeVisible();
    await expect(firstRow.getByText('Données insuffisantes', { exact: true })).toBeVisible();

    await firstRow.click();
    const detail = page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' });
    await expect(detail.locator('span.inline-flex').filter({ hasText: 'UNKNOWN' })).toBeVisible();
    await expect(detail.getByText(/Aucune recommandation fiable n’est produite/)).toBeVisible();
  });

  for (const scenario of [
    { key: 'keep', row: /Conserver/, detail: /Position Optimale/ },
    { key: 'adjust', row: /Ajuster :/, detail: /Ajuster le Prix à/ },
    { key: 'relocate', row: /Déplacer ➔ Amarr \(Domain\)/, detail: /Déplacer vers Amarr/ },
    { key: 'cancel', row: /Annuler l'Ordre/, detail: /Annuler : Concurrence Destructrice de Marge|Marché Inactif : Annulation Recommandée/ },
  ] as const) {
    test(`exposes a reliable ${scenario.key} decision in Operations`, async ({ page, request }) => {
      await prepareOperations(page, request, 'live', scenario.key);
      await launchSso(page);
      await expectOperationsLoaded(page);

      const firstRow = page.locator('tbody tr').first();
      await expect(firstRow.getByText(scenario.row)).toBeVisible();
      await firstRow.click();

      const detail = page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' });
      await expect(detail).toBeVisible();
      await expect(detail.getByText(scenario.detail)).toBeVisible();
      await expect(detail.getByText(/Aucune recommandation fiable n’est produite/)).toHaveCount(0);
    });
  }

  test('excludes PARTIAL market context from the outbid filter', async ({ page, request }) => {
    await prepareOperations(page, request, 'partial');
    await launchSso(page);
    await expectOperationsLoaded(page);

    await page.getByRole('button', { name: 'Sync Marché des Ordres' }).click();
    await expect(page.getByText('PARTIAL', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Dépassés \(0\)/ })).toBeVisible();
    await page.getByRole('button', { name: /Dépassés \(0\)/ }).click();
    await expect(page.getByText('Aucun ordre ne correspond aux critères.', { exact: true })).toBeVisible();
  });

  test('excludes STALE market context from the outbid filter', async ({ page, request }) => {
    await prepareOperations(page, request, 'live');
    await launchSso(page);
    await expectOperationsLoaded(page);

    await page.getByRole('button', { name: 'Sync Marché des Ordres' }).click();
    await expect(page.getByText('LIVE', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    await setMarketMode(request, 'error', 401);
    await page.getByRole('button', { name: 'Sync Marché des Ordres' }).click();
    await expect(page.getByText('STALE', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Dépassés \(0\)/ })).toBeVisible();
  });

  test('keeps active orders visible and refuses false decision state on market ERROR', async ({ page, request }) => {
    await prepareOperations(page, request, 'error');
    await launchSso(page);
    await expectOperationsLoaded(page);

    await page.getByRole('button', { name: 'Sync Marché des Ordres' }).click();
    await expect(page.getByText('ERROR', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Décision indisponible', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Impossible de déterminer l’état actuel des ordres.', { exact: true })).toHaveCount(0);
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await page.locator('tbody tr').first().click();
    await expect(
      page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Aucune recommandation fiable n’est produite/),
    ).toBeVisible();
  });

  test('preserves usable rows and marks the market PARTIAL when a later page fails', async ({ page, request }) => {
    await prepareOperations(page, request, 'partial');
    await launchSso(page);
    await expectOperationsLoaded(page);

    await page.getByRole('button', { name: 'Sync Marché des Ordres' }).click();
    await expect(page.getByText('PARTIAL', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await page.locator('tbody tr').first().click();
    const detail = page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' });
    await expect(detail).toBeVisible();
    await expect(detail.locator('span.inline-flex').filter({ hasText: 'PARTIAL' })).toBeVisible();
    await expect(detail.getByText(/Aucune recommandation fiable|Aucune recommandation supplémentaire/)).toBeVisible();
  });

  test('degrades a previously observed market snapshot to STALE instead of dropping the order context', async ({ page, request }) => {
    await prepareOperations(page, request, 'live');
    await launchSso(page);
    await expectOperationsLoaded(page);
    await expect(page.getByText('LIVE', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sync Marché des Ordres' }),
    ).toBeEnabled({ timeout: 15_000 });

    await setMarketMode(request, 'error', 401);

    await page.getByRole('button', { name: 'Sync Marché des Ordres' }).click();
    await expect(page.getByText('STALE', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await page.locator('tbody tr').first().click();
    const detail = page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' });
    await expect(detail).toBeVisible();
    await expect(detail.locator('span.inline-flex').filter({ hasText: 'STALE' })).toBeVisible();
    await expect(detail.getByText(/Âge des données/)).toBeVisible();
  });
});
