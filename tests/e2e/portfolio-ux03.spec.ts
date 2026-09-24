import { test, expect, type APIRequestContext } from '@playwright/test';

const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 43123);
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`;

async function resetFixture(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__control__/reset`);
  expect(response.ok()).toBeTruthy();
}

test.describe('UX-03 — Portfolio / Allocation', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixture(request);
  });

  test.afterEach(async ({ request }) => {
    await resetFixture(request);
  });

  test('keeps Real Portfolio and Proposed Allocation separate when economic sources are unavailable', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Portefeuille/ }).click();

    await expect(page.getByText('Real Portfolio', { exact: true })).toBeVisible();
    await expect(page.getByText('Proposed Allocation', { exact: true })).toBeVisible();

    await expect(page.getByText('Cash liquide', { exact: true })).toBeVisible();
    await expect(page.getByText('Buy escrow', { exact: true })).toBeVisible();
    await expect(page.getByText('Buy obligation', { exact: true })).toBeVisible();
    await expect(page.getByText('Obligation non couverte', { exact: true })).toBeVisible();
    await expect(page.getByText('Sell exposure', { exact: true })).toBeVisible();

    await expect(page.getByText('Budget d’allocation', { exact: true })).toBeVisible();
    await expect(page.getByText('Capital déployé', { exact: true })).toBeVisible();
    await expect(page.getByText('Capital non alloué', { exact: true })).toBeVisible();
    await expect(page.getByText('ROI projeté', { exact: true })).toBeVisible();

    await expect(page.getByText(/^Couverture (FULL|BOUNDED|PARTIAL|UNKNOWN)$/)).toBeVisible();
    await expect(page.getByText(/^(LIVE|CACHE|STALE|PARTIAL|ERROR|UNKNOWN)$/).first()).toBeVisible();

    await expect(page.getByText('Inventaire non autoritaire', { exact: true })).toBeVisible();
    await expect(page.getByText('Character Assets non intégré', { exact: true })).toBeVisible();
    await expect(page.getByText('Quantité, localisation et valeur complète du stock restent UNKNOWN', { exact: false })).toBeVisible();

    await expect(page.getByText('UNKNOWN', { exact: true })).toHaveCount(expect.any(Number));
    await expect(page.getByText('Proposed Allocation', { exact: true })).toHaveCount(1);
  });
});
