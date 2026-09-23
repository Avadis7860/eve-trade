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

async function expectOperationsLoaded(page: Page): Promise<void> {
  await expect(page.getByText('Ordres actifs', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
}

test.describe('UX-02 — Operations / Mes Ordres', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFixture(request);
    await setMarketMode(request, 'live');
    await page.goto('/');
    await openOrders(page);
  });

  test.afterEach(async ({ request }) => {
    await resetFixture(request);
  });

  test('exposes the operational decision context for a real active order fixture', async ({ page }) => {
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

  test('keeps active orders visible and refuses false decision state on market ERROR', async ({ page, request }) => {
    await setMarketMode(request, 'error', 401);
    await launchSso(page);
    await expectOperationsLoaded(page);

    await expect(page.getByText('ERROR', { exact: true }).first()).toBeVisible();
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
    await setMarketMode(request, 'partial');
    await launchSso(page);
    await expectOperationsLoaded(page);

    await expect(page.getByText('PARTIAL', { exact: true }).first()).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await page.locator('tbody tr').first().click();
    const detail = page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' });
    await expect(detail).toBeVisible();
    await expect(detail.getByText('PARTIAL', { exact: true })).toBeVisible();
    await expect(detail.getByText(/Aucune recommandation fiable|Aucune recommandation supplémentaire/)).toBeVisible();
  });

  test('degrades a previously observed market snapshot to STALE instead of dropping the order context', async ({ page, request }) => {
    await launchSso(page);
    await expectOperationsLoaded(page);
    await expect(page.getByText('LIVE', { exact: true }).first()).toBeVisible();

    await setMarketMode(request, 'error', 401);

    await page.getByRole('button', { name: 'Sync Marché des Ordres' }).click();
    await expect(page.getByText('STALE', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await page.locator('tbody tr').first().click();
    const detail = page.getByRole('dialog', { name: 'Détail opérationnel de l’ordre' });
    await expect(detail).toBeVisible();
    await expect(detail.getByText('STALE', { exact: true })).toBeVisible();
    await expect(detail.getByText(/Âge des données/)).toBeVisible();
  });
});
