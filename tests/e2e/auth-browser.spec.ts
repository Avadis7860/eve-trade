import { test, expect, type Page } from '@playwright/test';

const ALPHA = {
  id: 1001,
  name: 'E2E Character Alpha',
  token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJDTUFSQUNURVI6RVZFOjEwMDEiLCJuYW1lIjoiRTJFIENoYXJhY3RlciBBbHBoYSJ9.e2e-signature',
};
const BETA = {
  id: 1002,
  name: 'E2E Character Beta',
  token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJDTUFSQUNURVI6RVZFOjEwMDIiLCJuYW1lIjoiRTJFIENoYXJhY3RlciBCZXRhIn0.e2e-signature',
};

async function openOrders(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Ordres/ }).click();
  await expect(page.getByText('Connexion EVE Online SSO v2')).toBeVisible();
}

async function selectAppCallback(page: Page): Promise<void> {
  await page.getByText('App Host / Preview').click();
}

async function launchSso(page: Page) {
  await selectAppCallback(page);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' }).click();
  return popupPromise;
}

test.describe('E2E-001 — browser OAuth composition', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await openOrders(page);
  });

  test('nominal SSO popup → callback → postMessage → authenticated ESI → persisted session', async ({ page }) => {
    const backendRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/character/')) backendRequests.push(request.url());
    });

    const popupPromise = launchSso(page);
    const popup = await popupPromise;
    await popup.waitForURL(/\/auth\/callback/, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page.getByText(ALPHA.name)).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toContain(ALPHA.name);
    expect(backendRequests.some(url => url.includes(`/api/character/${ALPHA.id}/orders`))).toBeTruthy();

    await page.reload();
    await expect(page.getByText(ALPHA.name)).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toContain(ALPHA.name);
  });

  test('rejects forged same-origin postMessage from the main window', async ({ page }) => {
    await page.evaluate(({ id, name, token }) => {
      window.postMessage({
        type: 'OAUTH_AUTH_SUCCESS',
        token,
        character_id: id,
        character_name: name,
        refresh_token: 'forged-refresh',
        expires_in: 1200,
      }, window.location.origin);
    }, BETA);

    await expect(page.getByText(BETA.name)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toBeNull();
  });

  test('rejects callback state that was not issued by the application', async ({ page }) => {
    const response = await page.goto('/auth/callback?code=e2e-code-alpha&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(response?.status()).toBe(400);
    await expect(page.getByText(/Jeton Invalide|State Manquant|Sécurité CSRF/)).toBeVisible();
  });

  test('rejects a replayed OAuth callback state', async ({ page }) => {
    await page.goto('/');
    await openOrders(page);
    const popupPromise = launchSso(page);
    const popup = await popupPromise;
    await popup.waitForURL(/\/auth\/callback/, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const callbackUrl = popup.url();
    await expect(page.getByText(ALPHA.name)).toBeVisible({ timeout: 15_000 });
    await popup.close();

    const replay = await page.goto(callbackUrl);
    expect(replay?.status()).toBe(400);
    await expect(page.getByText(/Jeton Invalide|Jeton expiré/)).toBeVisible();
  });

  test('refreshes an expired character session through the real frontend API path', async ({ page }) => {
    const popupPromise = launchSso(page);
    const popup = await popupPromise;
    await popup.waitForURL(/\/auth\/callback/, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page.getByText(ALPHA.name)).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      const raw = localStorage.getItem('eve_trade_character_store_v3');
      if (!raw) throw new Error('missing persisted character store');
      const store = JSON.parse(raw);
      store.characters = store.characters.map((character: any) => ({
        ...character,
        expires_at: Date.now() - 1_000,
        is_token_expired: true,
      }));
      localStorage.setItem('eve_trade_character_store_v3', JSON.stringify(store));
    });

    await page.reload();
    await expect(page.getByText(ALPHA.name)).toBeVisible({ timeout: 15_000 });
    const store = await page.evaluate(() => JSON.parse(localStorage.getItem('eve_trade_character_store_v3')!));
    expect(store.characters[0].access_token).toBe(ALPHA.token);
    expect(store.characters[0].is_token_expired).toBeFalsy();
  });

  test('logout clears the character session and returns to the SSO card', async ({ page }) => {
    const popupPromise = launchSso(page);
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(page.getByText(ALPHA.name)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await expect(page.getByText('Connexion EVE Online SSO v2')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).not.toContain(ALPHA.name);
  });

  test('connects a second character and preserves strict character isolation', async ({ page }) => {
    const firstPopupPromise = launchSso(page);
    const firstPopup = await firstPopupPromise;
    await firstPopup.waitForLoadState('domcontentloaded');
    await expect(page.getByText(ALPHA.name)).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('Gérer vos personnages et comptes EVE liés').click();
    await page.getByRole('button', { name: /Ajouter un Pilote/ }).click();
    await expect(page.getByText('Ajouter / Connecter un Autre Pilote')).toBeVisible();

    await page.route('**/api/auth/url*', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.url = `${data.url}&character=beta`;
      await route.fulfill({ response, json: data });
    });

    const secondPopupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' }).click();
    const secondPopup = await secondPopupPromise;
    await secondPopup.waitForURL(/\/auth\/callback/, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page.getByText(BETA.name)).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toContain(ALPHA.name);
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toContain(BETA.name);

    const beforeSwitch = await page.evaluate(() => JSON.parse(localStorage.getItem('eve_trade_character_store_v3')!));
    expect(beforeSwitch.active_character_id).toBe(BETA.id);

    await page.getByTitle('Gérer vos personnages et comptes EVE liés').click();
    await expect(page.getByText(/2 pilotes/)).toBeVisible();

    await page.getByRole('button', { name: 'Activer' }).click();
    const afterSwitch = await page.evaluate(() => JSON.parse(localStorage.getItem('eve_trade_character_store_v3')!));
    expect(afterSwitch.active_character_id).toBe(ALPHA.id);
    expect(afterSwitch.characters.find((character: any) => character.character_id === ALPHA.id)?.access_token).toBe(ALPHA.token);
    expect(afterSwitch.characters.find((character: any) => character.character_id === BETA.id)?.access_token).toBe(BETA.token);
  });


  test('handles a controlled OAuth denial without authenticating the browser session', async ({ page }) => {
    await page.route('**/api/auth/url*', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.url = `${data.url}&e2e_error=access_denied&e2e_error_description=E2E%20consent%20denied`;
      await route.fulfill({ response, json: data });
    });

    const popupPromise = page.waitForEvent('popup');
    await page.getByText('App Host / Preview').click();
    await page.getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/auth\/callback\?error=access_denied/, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    await expect(page.getByText('Connexion EVE Online SSO v2')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toBeNull();
    await popup.close();
  });

  test('does not authenticate when the SSO popup is closed before callback completion', async ({ page }) => {
    const popupPromise = launchSso(page);
    const popup = await popupPromise;
    await expect(popup).toBeTruthy();
    await popup.close();

    await expect(page.getByText('Connexion EVE Online SSO v2')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toBeNull();
  });
});
