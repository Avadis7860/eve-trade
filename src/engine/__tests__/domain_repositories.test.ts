import { CatalogValidator } from '../../domain/catalog/CatalogValidator';
import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../../domain/universe/UniverseRepository';
import { CharacterRepository } from '../../domain/character/CharacterRepository';
import { EveTypeDetail, EveCharacterSession } from '../../types';

console.log('=== RUNNING DOMAIN REPOSITORIES & DATA INTEGRITY TESTS ===');

// --- 1. Testing CatalogValidator ---
console.log('1. Testing CatalogValidator...');
const validItem: EveTypeDetail = {
  type_id: 34,
  name: 'Tritanium',
  volume: 0.01,
  group_id: 18,
  category_id: 4,
};

const validResult = CatalogValidator.validateType(validItem);
if (!validResult.isValid) {
  throw new Error(`CatalogValidator failed on valid item: ${validResult.error}`);
}

// Invalid item: negative ID and empty name
const invalidResult = CatalogValidator.validateType({
  type_id: -5,
  name: '',
  volume: -1,
  group_id: 0,
  category_id: 0,
});
if (invalidResult.isValid) {
  throw new Error('CatalogValidator should have rejected negative ID and empty name');
}
if (!invalidResult.error) {
  throw new Error('CatalogValidator should have returned validation error');
}

// Test collection validation
const collectionRes = CatalogValidator.validateCollection([
  validItem,
  { type_id: -1, name: 'Bad' },
  { type_id: 34, name: 'Duplicate Tritanium' }, // duplicate ID
]);
if (collectionRes.validTypes.length !== 1) {
  throw new Error(`CatalogValidator.validateCollection expected 1 valid item, got ${collectionRes.validTypes.length}`);
}
if (collectionRes.errors.length < 2) {
  throw new Error(`CatalogValidator.validateCollection expected at least 2 errors, got ${collectionRes.errors.length}`);
}
console.log('✅ CatalogValidator verified.');

// --- 2. Testing CatalogRepository SSOT ---
console.log('2. Testing CatalogRepository SSOT...');
const catalog = CatalogRepository.getInstance();
const trit = catalog.getTypeById(34);
if (!trit || trit.name !== 'Tritanium') {
  throw new Error('CatalogRepository failed to return Tritanium for ID 34');
}

const plex = catalog.getTypeById(44992);
if (!plex || plex.name !== 'PLEX') {
  throw new Error('CatalogRepository failed to return PLEX for ID 44992');
}

// Custom type registration
catalog.registerCustomType({
  type_id: 999999,
  name: 'Test Neural Booster',
  volume: 1.0,
  group_id: 300,
  category_id: 20,
});
const custom = catalog.getTypeById(999999);
if (!custom || custom.name !== 'Test Neural Booster') {
  throw new Error('CatalogRepository custom type registration failed');
}

// Search
const searchMatches = catalog.search('Trit');
if (!searchMatches.some((t) => t.name === 'Tritanium')) {
  throw new Error('CatalogRepository search failed to find Tritanium');
}

console.log('✅ CatalogRepository SSOT verified.');

// --- 3. Testing UniverseRepository SSOT ---
console.log('3. Testing UniverseRepository SSOT...');
const universe = UniverseRepository.getInstance();
const jitaName = universe.getStationNameSync(60003760);
if (!jitaName.includes('Jita IV - Moon 4')) {
  throw new Error(`UniverseRepository failed to resolve Jita 4-4: ${jitaName}`);
}

const jitaHub = universe.getHubByStationId(60003760);
if (!jitaHub || jitaHub.system_id !== 30000142) {
  throw new Error('UniverseRepository failed to identify Jita as major market hub');
}

const amarrName = universe.getStationNameSync(60008494);
if (!amarrName.includes('Amarr VIII')) {
  throw new Error(`UniverseRepository failed to resolve Amarr VIII: ${amarrName}`);
}

const unknownName = universe.getStationNameSync(999999999);
if (!unknownName.startsWith('Station #')) {
  throw new Error('UniverseRepository failed fallback naming for unknown station');
}

console.log('✅ UniverseRepository SSOT verified.');

// --- 4. Testing CharacterRepository Data Integrity & Token Expiration ---
console.log('4. Testing CharacterRepository Invariants...');
const charRepo = CharacterRepository.getInstance();

// A: Session with no expiration must NEVER have an expiration invented
const rawSessionNoExp: EveCharacterSession = {
  character_id: 12345,
  character_name: 'Capsuleer Alpha',
  access_token: 'valid_looking_token',
  // expires_at missing
  portrait_url: '',
  last_sync: new Date().toISOString(),
  is_active: true,
};

const savedCharsAlpha = charRepo.saveCharacter(rawSessionNoExp, true);
const savedAlpha = savedCharsAlpha.find((c) => c.character_id === 12345)!;
if (savedAlpha.expires_at !== 0) {
  throw new Error(`Data Integrity Violation: CharacterRepository invented an expiration: ${savedAlpha.expires_at}`);
}
if (savedAlpha.auth_status !== 'SESSION_EXPIRED') {
  throw new Error(`CharacterRepository should mark session without expires_at as SESSION_EXPIRED, got: ${savedAlpha.auth_status}`);
}

// B: Session with valid future expiration
const futureExp = Date.now() + 600000;
const rawSessionValid: EveCharacterSession = {
  character_id: 54321,
  character_name: 'Capsuleer Beta',
  access_token: 'fresh_token',
  expires_at: futureExp,
  portrait_url: '',
  last_sync: new Date().toISOString(),
  is_active: false,
};

const savedCharsBeta = charRepo.saveCharacter(rawSessionValid, false);
const savedBeta = savedCharsBeta.find((c) => c.character_id === 54321)!;
if (savedBeta.expires_at !== futureExp) {
  throw new Error('CharacterRepository altered valid expires_at timestamp');
}
if (savedBeta.auth_status !== 'SESSION_VALID') {
  throw new Error(`CharacterRepository expected SESSION_VALID, got: ${savedBeta.auth_status}`);
}

// C: Character Snapshot Caching
charRepo.saveSnapshot(54321, {
  wallet_balance: 500000000,
  skills: { accounting: 5, broker_relations: 5 },
  active_orders: [
    {
      order_id: 1001,
      type_id: 34,
      region_id: 10000002,
      location_id: 60003760,
      price: 4.12,
      volume_remain: 1000000,
      volume_total: 1000000,
      is_buy_order: true,
      issued: new Date().toISOString(),
      duration: 90,
      escrow: 4120000,
    },
  ],
});

const cachedSnap = charRepo.getSnapshot(54321);
if (!cachedSnap || cachedSnap.wallet_balance !== 500000000 || cachedSnap.active_orders.length !== 1) {
  throw new Error('CharacterRepository snapshot retrieval failed');
}

// Cleanup test characters from repo
charRepo.removeCharacter(12345);
charRepo.removeCharacter(54321);

console.log('✅ CharacterRepository Invariants verified.');

console.log('🎉 ALL DOMAIN REPOSITORIES & DATA INTEGRITY TESTS PASSED WITH 100% SUCCESS!');
