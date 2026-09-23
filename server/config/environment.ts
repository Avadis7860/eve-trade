function readOptional(name: string): string {
  return process.env[name]?.trim() || '';
}

export interface EsiRuntimeConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  verifyUrl: string;
  metadataUrl: string;
  esiBaseUrl: string;
}

export interface RuntimeConfigStatus {
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  callbackConfigured: boolean;
  callbackUrl: string | null;
  authorizeUrl: string;
  tokenUrl: string;
  verifyUrl: string;
  metadataUrl: string;
  esiBaseUrl: string;
}

const DEFAULTS = {
  authorizeUrl: 'https://login.eveonline.com/v2/oauth/authorize/',
  tokenUrl: 'https://login.eveonline.com/v2/oauth/token',
  verifyUrl: 'https://login.eveonline.com/v2/oauth/verify',
  metadataUrl: 'https://login.eveonline.com/.well-known/oauth-authorization-server',
  esiBaseUrl: 'https://esi.evetech.net',
} as const;

export const ESI_RUNTIME_CONFIG: EsiRuntimeConfig = {
  clientId: readOptional('EVE_CLIENT_ID'),
  clientSecret: readOptional('EVE_CLIENT_SECRET'),
  callbackUrl: readOptional('EVE_CALLBACK_URL'),
  authorizeUrl: readOptional('EVE_SSO_AUTHORIZE_URL') || DEFAULTS.authorizeUrl,
  tokenUrl: readOptional('EVE_SSO_TOKEN_URL') || DEFAULTS.tokenUrl,
  verifyUrl: readOptional('EVE_SSO_VERIFY_URL') || DEFAULTS.verifyUrl,
  metadataUrl: readOptional('EVE_SSO_METADATA_URL') || DEFAULTS.metadataUrl,
  esiBaseUrl: readOptional('ESI_BASE_URL') || DEFAULTS.esiBaseUrl,
};

export function getRuntimeConfigStatus(): RuntimeConfigStatus {
  return {
    clientIdConfigured: Boolean(ESI_RUNTIME_CONFIG.clientId),
    clientSecretConfigured: Boolean(ESI_RUNTIME_CONFIG.clientSecret),
    callbackConfigured: Boolean(ESI_RUNTIME_CONFIG.callbackUrl),
    callbackUrl: ESI_RUNTIME_CONFIG.callbackUrl || null,
    authorizeUrl: ESI_RUNTIME_CONFIG.authorizeUrl,
    tokenUrl: ESI_RUNTIME_CONFIG.tokenUrl,
    verifyUrl: ESI_RUNTIME_CONFIG.verifyUrl,
    metadataUrl: ESI_RUNTIME_CONFIG.metadataUrl,
    esiBaseUrl: ESI_RUNTIME_CONFIG.esiBaseUrl,
  };
}

export function assertOAuthRuntimeConfig(): void {
  const missing: string[] = [];
  if (!ESI_RUNTIME_CONFIG.clientId) missing.push('EVE_CLIENT_ID');
  if (!ESI_RUNTIME_CONFIG.clientSecret) missing.push('EVE_CLIENT_SECRET');
  if (!ESI_RUNTIME_CONFIG.callbackUrl) missing.push('EVE_CALLBACK_URL');

  if (missing.length > 0) {
    throw new Error(`SSO_NOT_CONFIGURED: missing required environment variables: ${missing.join(', ')}`);
  }
}
