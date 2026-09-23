import assert from 'node:assert/strict';
import { ESI_RUNTIME_CONFIG, getRuntimeConfigStatus, assertOAuthRuntimeConfig } from '../config/environment';

assert.equal(ESI_RUNTIME_CONFIG.metadataUrl, process.env.EVE_SSO_METADATA_URL?.trim() || 'https://login.eveonline.com/.well-known/oauth-authorization-server');
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
