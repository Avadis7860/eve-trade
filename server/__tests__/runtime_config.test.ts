import assert from 'node:assert/strict';
import { ESI_RUNTIME_CONFIG, getRuntimeConfigStatus, assertOAuthRuntimeConfig } from '../config/environment';

assert.equal(ESI_RUNTIME_CONFIG.authorizeUrl, process.env.EVE_SSO_AUTHORIZE_URL?.trim() || 'https://login.eveonline.com/v2/oauth/authorize/');
assert.equal(ESI_RUNTIME_CONFIG.tokenUrl, process.env.EVE_SSO_TOKEN_URL?.trim() || 'https://login.eveonline.com/v2/oauth/token');
assert.equal(ESI_RUNTIME_CONFIG.verifyUrl, process.env.EVE_SSO_VERIFY_URL?.trim() || 'https://login.eveonline.com/oauth/verify');
assert.equal(ESI_RUNTIME_CONFIG.esiBaseUrl, process.env.ESI_BASE_URL?.trim() || 'https://esi.evetech.net');

const status = getRuntimeConfigStatus();
assert.equal(status.clientIdConfigured, Boolean(ESI_RUNTIME_CONFIG.clientId));
assert.equal(status.clientSecretConfigured, Boolean(ESI_RUNTIME_CONFIG.clientSecret));
assert.equal(status.callbackConfigured, Boolean(ESI_RUNTIME_CONFIG.callbackUrl));
assert.equal(status.callbackUrl, ESI_RUNTIME_CONFIG.callbackUrl || null);

// In normal CI this must fail closed rather than fabricate a partial configuration.
if (!status.clientIdConfigured || !status.clientSecretConfigured || !status.callbackConfigured) {
  assert.throws(assertOAuthRuntimeConfig, /SSO_NOT_CONFIGURED/);
}

console.log('runtime_config.test.ts: PASS');
