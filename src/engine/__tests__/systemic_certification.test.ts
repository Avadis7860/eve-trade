import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../../domain/universe/UniverseRepository';
import { CharacterRepository } from '../../domain/character/CharacterRepository';
import { AuthService } from '../../services/authService';
import { EveCharacterSession } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('=== RUNNING SYSTEMIC CERTIFICATION & PHASE 6 INTEGRATION TESTS ===\n');

// 1. Catalog Pipeline & Integrity Certification
console.log('1. Testing Catalog Pipeline & Custom Types Registration...');
const catalog = CatalogRepository.getInstance();

// Known item lookup
const tritanium = catalog.getTypeById(34);
assert(!!tritanium, 'Tritanium (34) must exist in catalog SSOT');
assert(tritanium?.name === 'Tritanium', 'Tritanium name matches');
assert(tritanium?.volume === 0.01, 'Tritanium volume is 0.01 m³');

// Custom item registration
catalog.registerCustomType({
  type_id: 999999,
  name: 'Systemic Test Antimatter Capsule',
  description: 'Certified test item for pipeline verification',
  volume: 1.5,
  group_id: 8888,
  group_name: 'Test Ammunition',
  category_id: 7,
  category_name: 'Module',
  average_price: 250000.0,
});

const customLookup = catalog.getTypeById(999999);
assert(!!customLookup, 'Custom type 999999 must be resolvable via catalog SSOT');
assert(customLookup?.name === 'Systemic Test Antimatter Capsule', 'Custom type name matches');
assert(customLookup?.volume === 1.5, 'Custom type volume matches');

// Search functionality
const searchResults = catalog.searchTypes('Antimatter');
assert(searchResults.some((t) => t.type_id === 999999), 'Search finds newly registered custom type');
console.log('✅ Catalog Pipeline & Custom Types Registration verified.\n');

// 2. Spatial Universe & Structure Resolution Certification
console.log('2. Testing Spatial Universe & NPC vs Upwell Structure Disambiguation...');
const universe = UniverseRepository.getInstance();

// NPC Stations
const jitaStation = universe.resolveLocationSync(60003760);
assert(!jitaStation.is_structure, 'Jita IV-4 (60003760) is correctly identified as an NPC station');
assert(jitaStation.system_id === 30000142, 'Jita system ID matches (30000142)');
assert(jitaStation.name.includes('Jita IV'), 'Jita station name matches');

const amarrStation = universe.resolveLocationSync(60008494);
assert(!amarrStation.is_structure, 'Amarr VIII (60008494) is correctly identified as an NPC station');
assert(amarrStation.name.includes('Amarr VIII'), 'Amarr station name matches');

// Player Citadels / Upwell Structures (ID > 100_000_000_000)
const playerStructure = universe.resolveLocationSync(1028854415329);
assert(playerStructure.is_structure === true, 'Player structure (1028854415329) is classified as an Upwell structure');

// Custom Structure Registration
universe.registerStructure({
  location_id: 1039999999999,
  name: 'Perimeter - Tranquility Trading Tower',
  system_id: 30000144, // Perimeter
  system_name: 'Perimeter',
  region_id: 10000002,
  region_name: 'The Forge',
});

const keepstar = universe.resolveLocationSync(1039999999999);
assert(keepstar.is_structure === true, 'Registered Keepstar is an Upwell structure');
assert(keepstar.name.includes('Tranquility Trading Tower'), 'Keepstar name matches');
assert(keepstar.region_id === 10000002, 'Keepstar region ID matches The Forge');
console.log('✅ Spatial Universe & Structure Disambiguation verified.\n');

// 3. Session Persistence & Multi-Account Integrity Certification
console.log('3. Testing Multi-Account Session Persistence & Security Invariants...');
const charRepo = CharacterRepository.getInstance();

const dummySessionA: EveCharacterSession = {
  character_id: 91001001,
  character_name: 'Trader Alpha',
  access_token: 'fake_jwt_alpha',
  expires_at: Date.now() + 1200000,
  portrait_url: 'https://images.evetech.net/characters/91001001/portrait?size=128',
  wallet_balance: 500000000.0,
  accounting_skill: 5,
  broker_relations_skill: 5,
  last_sync: new Date().toISOString(),
  is_active: true,
  session_version: 2,
  auth_status: 'SESSION_VALID',
};

const dummySessionB: EveCharacterSession = {
  character_id: 91001002,
  character_name: 'Trader Beta (Alpha Clone)',
  access_token: 'fake_jwt_beta',
  expires_at: Date.now() - 5000, // Expired
  portrait_url: 'https://images.evetech.net/characters/91001002/portrait?size=128',
  wallet_balance: 12000000.0,
  accounting_skill: 3, // Alpha clone max
  broker_relations_skill: 3,
  last_sync: new Date().toISOString(),
  is_active: false,
  session_version: 2,
  auth_status: 'SESSION_EXPIRED',
};

// Test CharacterRepository snapshot caching
charRepo.saveSnapshot(dummySessionA.character_id, {
  wallet_balance: dummySessionA.wallet_balance!,
  skills: { accounting: 5, broker_relations: 5 },
  active_orders: [],
  source: 'server_proxy',
});

const snapA = charRepo.getSnapshot(dummySessionA.character_id);
assert(!!snapA, 'Snapshot for Trader Alpha must exist in CharacterRepository');
assert(snapA?.wallet_balance === 500000000.0, 'Trader Alpha wallet matches');

// Test AuthService token expiration detection
assert(!AuthService.isTokenExpiredOrExpiringSoon(dummySessionA), 'Trader Alpha token is fresh');
assert(AuthService.isTokenExpiredOrExpiringSoon(dummySessionB), 'Trader Beta token is correctly detected as expired');

console.log('✅ Multi-Account Session Persistence & Security Invariants verified.\n');

console.log('🎉 ALL SYSTEMIC CERTIFICATION & PHASE 6 INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
