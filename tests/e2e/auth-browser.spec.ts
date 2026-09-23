import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 43123);
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`;

const ALPHA = {
  id: 1001,
  name: 'E2E Character Alpha',
  token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJDSEFSQUNURVI6RVZFOjEwMDEiLCJuYW1lIjoiRTJFIENoYXJhY3RlciBBbHBoYSJ9.e2e-signature',
};

const BETA = {
  id: 1002,
  name: 'E2E Character Beta',
  token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJDSEFSQUNURVI6RVZFOjEwMDIiLCJuYW1lIjoiRTJFIENoYXJhY3RlciBCZXRhIn0.e2e-signature',
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

async function configureNextAuth(
  request: APIRequestContext,
  control: {
    character?: 'alpha' | 'beta';
    errorCode?: string;
    errorDescription?: string;
    delayMs?: number;
  },
): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__control__/next-auth`, {
    data: {
      character: control.character || 'alpha',
      errorCode: control.errorCode,
      errorDescription: control.errorDescription,
      delayMs: control.delayMs || 0,
    },
  });

  expect(response.ok()).toBeTruthy();
}

async function resetFixture(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${MOCK_BASE_URL}/__control__/reset`);
  expect(response.ok()).toBeTruthy();
}

async function emptyCharacterStore(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('eve_trade_character_store_v3');
    if (!raw) return true;
    const store = JSON.parse(raw);
    return Array.isArray(store.characters) && store.characters.length === 0;
  });
}

async function expectAuthenticatedCharacter(
  page: Page,
  characterName: string,
): Promise<void> {
  await expect(
    page.getByRole('banner').getByText(characterName, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
}

async function launchSsoWithoutPopup(page: Page): Promise<void> {
  await selectAppCallback(page);

  const authResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/url') &&
    response.request().method() === 'GET'
  );

  await page
    .getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' })
    .click();

  const authResponse = await authResponsePromise;
  expect(authResponse.ok()).toBeTruthy();
}

async function waitForOAuthCallback(popup: Page): Promise<URL> {
  await popup.waitForURL(/\/auth\/callback\?/, {
    waitUntil: 'commit',
    timeout: 15_000,
  });

  const callbackUrl = new URL(popup.url());
  expect(callbackUrl.searchParams.get('state')).toBeTruthy();
  return callbackUrl;
}

async function launchSso(page: Page): Promise<{ popup: Page; authUrl: string }> {
  await selectAppCallback(page);

  const authResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/url') &&
    response.request().method() === 'GET'
  );
  const popupPromise = page.waitForEvent('popup');

  await page
    .getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' })
    .click();

  const [authResponse, popup] = await Promise.all([
    authResponsePromise,
    popupPromise,
  ]);

  expect(authResponse.ok()).toBeTruthy();
  const authData = await authResponse.json();

  return { popup, authUrl: authData.url };
}

test.describe('E2E-001 — browser OAuth composition', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFixture(request);
    await page.goto('/');
    await openOrders(page);
  });

  test.afterEach(async ({ request }) => {
    await resetFixture(request);
  });

  test('nominal SSO popup → callback → postMessage → authenticated ESI → persisted session', async ({ page }) => {
    const backendRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/character/')) {
        backendRequests.push(request.url());
      }
    });

    const { popup, authUrl } = await launchSso(page);

    expect(new URL(authUrl).port).toBe(String(MOCK_PORT));
    expect(new URL(authUrl).pathname).toBe('/v2/oauth/authorize/');

    await waitForOAuthCallback(popup);

    await expectAuthenticatedCharacter(page, ALPHA.name);
    const persistedSession = await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('eve_trade_character_store_v3')!);
      return store.characters.find((character: any) => character.character_id === 1001);
    });
    expect(persistedSession.is_token_expired).toBeFalsy();
    expect(persistedSession.expires_at).toBeGreaterThan(Date.now());
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toContain(ALPHA.name);
    expect(
      backendRequests.some(url => url.includes(`/api/character/${ALPHA.id}/orders`)),
    ).toBeTruthy();

    await page.reload();
    await expectAuthenticatedCharacter(page, ALPHA.name);
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toContain(ALPHA.name);
  });

  test('recovers through the same-window callback when popup creation is blocked', async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(window, 'open', {
        configurable: true,
        value: () => null,
      });
    });

    await launchSsoWithoutPopup(page);

    await expectAuthenticatedCharacter(page, ALPHA.name);
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_character_store_v3'))).toContain(ALPHA.name);
    expect(await page.evaluate(() => localStorage.getItem('eve_trade_oauth_result_v1'))).toBeNull();
  });

  test('rejects forged same-origin postMessage from the main window', async ({ page }) => {
    await page.evaluate(({ id, name, token }) => {
      window.postMessage(
        {
          type: 'OAUTH_AUTH_SUCCESS',
          token,
          character_id: id,
          character_name: name,
          refresh_token: 'forged-refresh',
          expires_in: 1200,
        },
        window.location.origin,
      );
    }, BETA);

    await expect(page.getByRole('banner').getByText(BETA.name, { exact: true })).toHaveCount(0);
    expect(await emptyCharacterStore(page)).toBeTruthy();
  });

  test('rejects callback state that was not issued by the application', async ({ page }) => {
    const response = await page.goto(
      '/auth/callback?code=e2e-code-alpha&state=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );

    expect(response?.status()).toBe(400);
    await expect(page.getByText(/Jeton Invalide|Jeton State Manquant|Sécurité CSRF/)).toBeVisible();
    expect(await emptyCharacterStore(page)).toBeTruthy();
  });

  test('rejects token exchange when the callback code is invalid', async ({ page, request }) => {
    const authResponse = await request.get('/api/auth/url');
    expect(authResponse.ok()).toBeTruthy();
    const authData = await authResponse.json();

    const callback = await page.goto(
      `/auth/callback?code=invalid-e2e-code&state=${encodeURIComponent(authData.state)}`,
    );

    expect(callback?.status()).toBe(502);
    await expect(page.getByText(/Échec de l'authentification EVE SSO/)).toBeVisible();
  });

  test('rejects a token exchange when redirect URI does not match the OAuth state binding', async ({ request }) => {
    const authResponse = await request.get(
      '/api/auth/url?redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fauth%2Fcallback',
    );
    expect(authResponse.ok()).toBeTruthy();
    const authData = await authResponse.json();

    const tokenResponse = await request.post('/api/auth/token', {
      data: {
        code: 'e2e-code-alpha',
        state: authData.state,
        redirect_uri: 'http://localhost:3000/auth/callback',
      },
    });

    expect(tokenResponse.status()).toBe(400);
    const body = await tokenResponse.json();
    expect(body.error).toBe('INVALID_OR_EXPIRED_STATE');
  });

  test('rejects a callback after the OAuth state TTL expires', async ({ page, request }) => {
    await configureNextAuth(request, { delayMs: 1500 });

    const { popup } = await launchSso(page);
    await waitForOAuthCallback(popup);

    await expect(popup.getByText(/Sécurité CSRF : Jeton Invalide ou Expiré/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('banner').getByText(ALPHA.name, { exact: true })).toHaveCount(0);
    expect(await emptyCharacterStore(page)).toBeTruthy();
  });

  test('rejects a replayed OAuth callback state', async ({ page }) => {
    const { popup } = await launchSso(page);
    await waitForOAuthCallback(popup);

    const callbackUrl = new URL(popup.url());
    await expectAuthenticatedCharacter(page, ALPHA.name);
    await popup.close();

    const replay = await page.goto(callbackUrl);
    expect(replay?.status()).toBe(400);
    await expect(page.getByText(/Jeton Invalide ou Expiré/)).toBeVisible();
  });

  test('refreshes an expired character session through the real frontend API path', async ({ page }) => {
    const { popup } = await launchSso(page);
    await waitForOAuthCallback(popup);
    await expectAuthenticatedCharacter(page, ALPHA.name);

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

    const refreshRequestPromise = page.waitForRequest(request =>
      request.method() === 'POST' && request.url().endsWith('/api/auth/refresh'),
    );

    await page.reload();
    await refreshRequestPromise;
    await expectAuthenticatedCharacter(page, ALPHA.name);

    const store = await page.evaluate(() => JSON.parse(localStorage.getItem('eve_trade_character_store_v3')!));
    expect(store.characters[0].character_id).toBe(ALPHA.id);
    expect(store.characters[0].access_token).toBe(ALPHA.token);
    expect(store.characters[0].is_token_expired).toBeFalsy();
  });

  test('logout clears the character session and returns to the SSO card', async ({ page }) => {
    const { popup } = await launchSso(page);
    await waitForOAuthCallback(popup);
    await expectAuthenticatedCharacter(page, ALPHA.name);

    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await expect(
      page.getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' }),
    ).toBeVisible();
    expect(await emptyCharacterStore(page)).toBeTruthy();
  });

  test('connects a second character and preserves strict character isolation', async ({ page, request }) => {
    const first = await launchSso(page);
    await waitForOAuthCallback(first.popup);
    await expectAuthenticatedCharacter(page, ALPHA.name);
    await first.popup.close();

    await page.getByTitle('Gérer vos personnages et comptes EVE liés').click();
    await page.getByRole('button', { name: /Ajouter un Pilote/ }).click();
    await expect(page.getByText('Ajouter / Connecter un Autre Pilote')).toBeVisible();

    await configureNextAuth(request, { character: 'beta' });

    const second = await launchSso(page);
    await waitForOAuthCallback(second.popup);
    await expectAuthenticatedCharacter(page, BETA.name);
    await second.popup.close();

    const store = await page.evaluate(() => JSON.parse(localStorage.getItem('eve_trade_character_store_v3')!));
    expect(store.characters).toHaveLength(2);
    expect(store.characters.map((character: any) => character.character_id).sort()).toEqual([ALPHA.id, BETA.id]);
    expect(store.active_character_id).toBe(BETA.id);

    const crossCharacterStatus = await page.evaluate(
      async ({ id, token }) => {
        const response = await fetch(`/api/character/${id}/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.status;
      },
      { id: ALPHA.id, token: BETA.token },
    );
    expect(crossCharacterStatus).toBe(403);

    await page.getByRole('button', { name: /Flotte & Rôles \(2\)/ }).click();
    await expect(page.getByText('2 pilotes', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activer' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Activer' }).click();

    const afterSwitch = await page.evaluate(() => JSON.parse(localStorage.getItem('eve_trade_character_store_v3')!));
    expect(afterSwitch.active_character_id).toBe(ALPHA.id);
    expect(
      afterSwitch.characters.find((character: any) => character.character_id === ALPHA.id)?.access_token,
    ).toBe(ALPHA.token);
    expect(
      afterSwitch.characters.find((character: any) => character.character_id === BETA.id)?.access_token,
    ).toBe(BETA.token);
  });

  test('handles a controlled OAuth denial without authenticating the browser session', async ({ page, request }) => {
    await configureNextAuth(request, {
      errorCode: 'access_denied',
      errorDescription: 'E2E consent denied',
    });

    const { popup } = await launchSso(page);
    const callbackUrl = await waitForOAuthCallback(popup);
    expect(callbackUrl.searchParams.get('error')).toBe('access_denied');
    await expect(popup.getByText('Autorisation Refusée')).toBeVisible();
    expect(await emptyCharacterStore(page)).toBeTruthy();
    await expect(page.getByRole('banner').getByText(ALPHA.name, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Ouvrir la Fenêtre Officielle EVE SSO' }),
    ).toBeVisible();
  });

  test('does not authenticate when the SSO popup is closed before callback completion', async ({ page, request }) => {
    await configureNextAuth(request, { delayMs: 5000 });

    const { popup } = await launchSso(page);
    await popup.close();

    expect(await emptyCharacterStore(page)).toBeTruthy();
    await expect(page.getByRole('banner').getByText(ALPHA.name, { exact: true })).toHaveCount(0);
  });
});
