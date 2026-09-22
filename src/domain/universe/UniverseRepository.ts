import {
  MarketHub,
  LocationResolutionResult,
  LocationResolutionStatus,
  SystemResolutionResult,
  RegionResolutionResult,
  JumpRoute,
} from '../../types';
import { MAJOR_MARKET_HUBS, KNOWN_STATION_NAMES } from '../../data/universe';
import { UniverseGraphRepository } from './UniverseGraphRepository';
import { RoutePolicy } from './RouteEngine';
import { RouteIndex } from './RouteIndex';
import { certifyRoute } from './RouteCertification';
import { certifiedRouteToJumpRoute, unknownRouteToJumpRoute } from './CertifiedRouteAdapter';
import universeDataRaw from '../../data/universeData.json';
import { CANONICAL_UNIVERSE_MANIFEST } from '../../data/universeManifest';
import { UniverseValidator, UniverseValidationResult } from './UniverseValidator';

export type { LocationResolutionResult as LocationResolution };

export interface SystemInfo {
  system_id: number;
  name: string;
  region_id?: number;
  region_name?: string;
  security_status?: number;
}

export interface RegionInfo {
  region_id: number;
  name: string;
}

interface UniverseDataFormat {
  regions: Record<string, string>;
  systems: Record<string, { name: string; region_id: number; security: number }>;
  stations: Record<string, { name: string; system_id: number; type_id?: number }>;
}

const universeData = universeDataRaw as unknown as UniverseDataFormat;

export class UniverseRepository {
  private static instance: UniverseRepository;
  private locationCache = new Map<number, LocationResolutionResult>();
  private dynamicLocationCache = new Map<number, LocationResolutionResult>();
  private hubMap = new Map<string, MarketHub>();
  private stationToHubMap = new Map<number, MarketHub>();
  private systemToHubMap = new Map<number, MarketHub>();
  private regionMap = new Map<number, string>();
  private systemMap = new Map<number, { name: string; region_id: number; security: number }>();
  private stationMap = new Map<number, { name: string; system_id: number; type_id?: number }>();
  private readonly integrity: UniverseValidationResult;
  private readonly graphRepository: UniverseGraphRepository;
  private readonly routeIndexCache = new Map<string, RouteIndex>();

  private constructor() {
    this.integrity = UniverseValidator.validate(universeDataRaw);
    this.graphRepository = new UniverseGraphRepository();

    // 1. Seed All 114 Regions
    if (universeData && universeData.regions) {
      for (const [ridStr, rName] of Object.entries(universeData.regions)) {
        this.regionMap.set(Number(ridStr), rName);
      }
    }

    // 2. Seed All 8,490 Solar Systems
    if (universeData && universeData.systems) {
      for (const [sidStr, sInfo] of Object.entries(universeData.systems)) {
        this.systemMap.set(Number(sidStr), sInfo);
      }
    }

    // 3. Seed All 5,210 NPC Stations
    if (universeData && universeData.stations) {
      for (const [stIdStr, stInfo] of Object.entries(universeData.stations)) {
        const stId = Number(stIdStr);
        this.stationMap.set(stId, stInfo);
        const sys = this.systemMap.get(stInfo.system_id);
        const rName = sys ? this.regionMap.get(sys.region_id) : undefined;
        this.locationCache.set(stId, {
          status: 'RESOLVED_STATION',
          location_id: stId,
          name: stInfo.name,
          system_id: stInfo.system_id,
          system_name: sys?.name,
          region_id: sys?.region_id,
          region_name: rName,
          security_status: sys?.security,
          is_structure: false,
          is_hub: false,
          source: 'static_npc',
          is_verified: this.integrity.isReady,
          confidence: this.integrity.isReady ? 1.0 : 0,
          provenance: {
            source: 'static_dataset',
            dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
            dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
            loaded_at: new Date().toISOString(),
            verified: this.integrity.isReady,
            confidence: this.integrity.isReady ? 1.0 : 0,
            completeness: this.integrity.isReady ? 'complete' : 'partial',
            scope: 'npc_station',
          },
        });
      }
    }

    // 4. Register hubs as business metadata without overriding canonical universe facts.
    for (const hub of MAJOR_MARKET_HUBS) {
      this.hubMap.set(hub.id, hub);
      this.stationToHubMap.set(hub.station_id, hub);
      this.systemToHubMap.set(hub.system_id, hub);

      const canonicalStation = this.stationMap.get(hub.station_id);
      const canonicalSystem = this.systemMap.get(hub.system_id);
      const canonicalRegionName = this.regionMap.get(hub.region_id);
      const idsConsistent =
        canonicalStation?.system_id === hub.system_id &&
        canonicalSystem?.region_id === hub.region_id &&
        canonicalRegionName !== undefined;

      if (canonicalStation && canonicalSystem && idsConsistent) {
        const existing = this.locationCache.get(hub.station_id);
        if (existing) {
          existing.is_hub = true;
          existing.hub_id = hub.id;
          existing.status = 'RESOLVED_HUB';
          existing.source = 'static_npc';
          existing.is_verified = this.integrity.isReady;
          existing.confidence = this.integrity.isReady ? 1.0 : 0;
          existing.provenance = {
            source: 'static_dataset',
            dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
            dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
            loaded_at: new Date().toISOString(),
            verified: this.integrity.isReady,
            confidence: this.integrity.isReady ? 1.0 : 0,
            completeness: this.integrity.isReady ? 'complete' : 'partial',
            scope: 'major_market_hub',
          };
        }
      } else {
        this.locationCache.set(hub.station_id, {
          status: 'LOCATION_UNKNOWN',
          location_id: hub.station_id,
          name: hub.station,
          system_id: canonicalStation?.system_id,
          system_name: canonicalSystem?.name,
          region_id: canonicalSystem?.region_id,
          region_name: canonicalRegionName,
          security_status: canonicalSystem?.security,
          is_structure: hub.hub_type === 'citadel',
          is_hub: true,
          hub_id: hub.id,
          source: 'fallback',
          is_verified: false,
          confidence: 0,
          error: 'Configured market hub is missing from or inconsistent with the canonical universe dataset',
          provenance: {
            source: 'unknown',
            dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
            dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
            loaded_at: new Date().toISOString(),
            verified: false,
            confidence: 0,
            completeness: 'unknown',
            scope: 'major_market_hub',
          },
        });
      }
    }

    // 5. Known station names overlay
    for (const [stIdStr, name] of Object.entries(KNOWN_STATION_NAMES)) {
      const stId = Number(stIdStr);
      const existing = this.locationCache.get(stId);
      if (existing) {
        existing.name = name;
      } else {
        this.locationCache.set(stId, {
          status: 'LOCATION_UNKNOWN',
          location_id: stId,
          name,
          is_structure: false,
          is_hub: false,
          source: 'fallback',
          is_verified: false,
          confidence: 0,
          error: `Station ${stId} has a known display name but no canonical universe record`,
          provenance: {
            source: 'fallback',
            dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
            dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
            loaded_at: new Date().toISOString(),
            verified: false,
            confidence: 0,
            completeness: 'unknown',
            scope: 'station_name_overlay',
          },
        });
      }
    }
  }

  static getInstance(): UniverseRepository {
    if (!UniverseRepository.instance) {
      UniverseRepository.instance = new UniverseRepository();
    }
    return UniverseRepository.instance;
  }

  /**
   * Resets the repository instance (primarily for isolated test executions).
   */
  static resetInstance(): void {
    UniverseRepository.instance = new UniverseRepository();
  }

  /**
   * Returns all major hubs. Single Source of Truth for hubs across the application.
   */
  getHubs(): MarketHub[] {
    return Array.from(this.hubMap.values());
  }

  /**
   * Finds a hub by ID (e.g. 'jita', 'amarr').
   */
  getHubById(id: string): MarketHub | undefined {
    return this.hubMap.get(id.toLowerCase());
  }

  /**
   * Finds a hub by station_id.
   */
  getHubByStationId(stationId: number): MarketHub | undefined {
    return this.stationToHubMap.get(stationId);
  }

  /**
   * Resolves a hub from either an ID (string) or stationId (number).
   */
  resolveHub(identifier: string | number): MarketHub | undefined {
    if (typeof identifier === 'string') {
      return this.getHubById(identifier);
    }
    return this.getHubByStationId(identifier);
  }

  /**
   * Resolves synchronous station name if known with guaranteed deterministic fallback.
   */
  getStationNameSync(stationId: number): string {
    const loc = this.resolveLocationSync(stationId);
    return loc.name;
  }

  /**
   * Resolves a location exclusively from the canonical static universe dataset.
   * Dynamic ESI/structure cache entries are intentionally invisible at this boundary.
   */
  resolveCanonicalLocationSync(locationId: number): LocationResolutionResult {
    const cached = this.locationCache.get(locationId);
    if (cached) return cached;

    const st = this.stationMap.get(locationId);
    if (st) {
      const sys = this.systemMap.get(st.system_id);
      const rName = sys ? this.regionMap.get(sys.region_id) : undefined;
      const res: LocationResolutionResult = {
        status: 'RESOLVED_STATION',
        location_id: locationId,
        name: st.name,
        system_id: st.system_id,
        system_name: sys?.name,
        region_id: sys?.region_id,
        region_name: rName,
        security_status: sys?.security,
        is_structure: false,
        is_hub: false,
        source: 'static_npc',
        is_verified: this.integrity.isReady,
        confidence: this.integrity.isReady ? 1.0 : 0,
        provenance: {
          source: 'static_dataset',
          dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
          dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
          loaded_at: new Date().toISOString(),
          verified: this.integrity.isReady,
          confidence: this.integrity.isReady ? 1.0 : 0,
          completeness: this.integrity.isReady ? 'complete' : 'partial',
          scope: 'npc_station',
        },
      };
      this.locationCache.set(locationId, res);
      return res;
    }

    const isStructure = locationId >= 1000000000000;
    const fallback: LocationResolutionResult = {
      status: 'LOCATION_UNKNOWN',
      location_id: locationId,
      name: isStructure ? `Structure #${locationId}` : `Station #${locationId}`,
      is_structure: isStructure,
      is_hub: false,
      source: 'fallback',
      is_verified: false,
      confidence: 0,
      error: `Location ID ${locationId} not found in the canonical static universe dataset`,
      provenance: {
        source: 'unknown',
        dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
        dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
        loaded_at: new Date().toISOString(),
        verified: false,
        confidence: 0,
        completeness: 'unknown',
        scope: 'canonical_location',
      },
    };
    this.locationCache.set(locationId, fallback);
    return fallback;
  }

  /**
   * Resolves a location for general UI/orchestration use.
   * Canonical static data always has precedence; explicitly registered ESI/structure
   * records may be returned here but are never treated as canonical by financial code.
   */
  resolveLocationSync(locationId: number): LocationResolutionResult {
    const canonical = this.locationCache.get(locationId);
    if (canonical) return canonical;

    const dynamic = this.dynamicLocationCache.get(locationId);
    if (dynamic) return dynamic;

    return this.resolveCanonicalLocationSync(locationId);
  }

  /**
   * Registers a known structure or citadel into the cache.
   */
  registerStructure(
    structure: {
      location_id: number;
      name: string;
      system_id?: number;
      system_name?: string;
      region_id?: number;
      region_name?: string;
      security_status?: number;
    },
    verified = false
  ): LocationResolutionResult {
    const resolution: LocationResolutionResult = {
      status: 'RESOLVED_STRUCTURE',
      location_id: structure.location_id,
      name: structure.name,
      system_id: structure.system_id,
      system_name: structure.system_name,
      region_id: structure.region_id,
      region_name: structure.region_name,
      security_status: structure.security_status,
      is_structure: true,
      is_hub: false,
      source: 'structure_cache',
      is_verified: verified,
      confidence: verified ? 1.0 : 0,
      provenance: {
        source: 'structure_cache',
        dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
        dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
        loaded_at: new Date().toISOString(),
        verified,
        confidence: verified ? 1.0 : 0,
        completeness: verified ? 'complete' : 'unknown',
        scope: 'upwell_structure',
      },
    };
    this.dynamicLocationCache.set(structure.location_id, resolution);
    return resolution;
  }

  /**
   * Resolves station domain entity synchronously.
   */
  resolveStation(stationId: number): LocationResolutionResult {
    return this.resolveLocationSync(stationId);
  }

  /**
   * Alias for backward compatibility.
   */
  getStation(stationId: number): LocationResolutionResult {
    return this.resolveLocationSync(stationId);
  }

  /**
   * Resolves solar system domain entity with canonical provenance.
   */
  resolveSystem(systemId: number): SystemResolutionResult {
    const sys = this.systemMap.get(systemId);
    const hub = this.systemToHubMap.get(systemId);
    if (sys) {
      return {
        status: 'RESOLVED_SYSTEM',
        system_id: systemId,
        name: sys.name,
        region_id: sys.region_id,
        region_name: this.regionMap.get(sys.region_id),
        security_status: sys.security,
        is_verified: this.integrity.isReady,
        confidence: this.integrity.isReady ? 1.0 : 0,
        source: hub ? 'hub' : 'static_universe',
        provenance: {
          source: 'static_dataset',
          dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
          dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
          loaded_at: new Date().toISOString(),
          verified: this.integrity.isReady,
          confidence: this.integrity.isReady ? 1.0 : 0,
          completeness: this.integrity.isReady ? 'complete' : 'partial',
          scope: 'solar_system',
        },
      };
    }
    for (const loc of this.locationCache.values()) {
      if (loc.system_id === systemId) {
        return {
          status: 'SYSTEM_UNKNOWN',
          system_id: systemId,
          name: loc.system_name || `System #${systemId}`,
          region_id: loc.region_id,
          region_name: loc.region_name,
          security_status: loc.security_status,
          is_verified: false,
          confidence: 0,
          source: 'inferred',
          error: `System ID ${systemId} is only inferred from a non-canonical location cache entry`,
          provenance: {
            source: 'fallback',
            dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
            dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
            loaded_at: new Date().toISOString(),
            verified: false,
            confidence: 0,
            completeness: 'unknown',
            scope: 'inferred_system',
          },
        };
      }
    }
    return {
      status: 'SYSTEM_UNKNOWN',
      system_id: systemId,
      name: `System #${systemId}`,
      is_verified: false,
      confidence: 0.0,
      source: 'fallback',
      error: `System ID ${systemId} not found in solar system dataset`,
      provenance: {
        source: 'unknown',
        dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
        dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
        loaded_at: new Date().toISOString(),
        verified: false,
        confidence: 0,
        completeness: 'unknown',
        scope: 'solar_system',
      },
    };
  }

  /**
   * Resolves solar system domain entity (legacy helper).
   */
  getSystem(systemId: number): SystemInfo {
    const res = this.resolveSystem(systemId);
    return {
      system_id: res.system_id,
      name: res.name,
      region_id: res.region_id,
      region_name: res.region_name,
      security_status: res.security_status,
    };
  }

  /**
   * Resolves solar system name synchronously.
   */
  getSystemName(systemId: number): string {
    return this.resolveSystem(systemId).name;
  }

  /**
   * Resolves region domain entity with canonical provenance.
   */
  resolveRegion(regionId: number): RegionResolutionResult {
    const name = this.regionMap.get(regionId);
    if (name) {
      return {
        status: 'RESOLVED_REGION',
        region_id: regionId,
        name,
        is_verified: this.integrity.isReady,
        confidence: this.integrity.isReady ? 1.0 : 0,
        source: 'static_universe',
        provenance: {
          source: 'static_dataset',
          dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
          dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
          loaded_at: new Date().toISOString(),
          verified: this.integrity.isReady,
          confidence: this.integrity.isReady ? 1.0 : 0,
          completeness: this.integrity.isReady ? 'complete' : 'partial',
          scope: 'region',
        },
      };
    }
    return {
      status: 'REGION_UNKNOWN',
      region_id: regionId,
      name: `Region #${regionId}`,
      is_verified: false,
      confidence: 0.0,
      source: 'fallback',
      error: `Region ID ${regionId} not found in universe dataset`,
      provenance: {
        source: 'unknown',
        dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
        dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
        loaded_at: new Date().toISOString(),
        verified: false,
        confidence: 0,
        completeness: 'unknown',
        scope: 'region',
      },
    };
  }

  /**
   * Resolves region domain entity (legacy helper).
   */
  getRegion(regionId: number): RegionInfo {
    const res = this.resolveRegion(regionId);
    return {
      region_id: res.region_id,
      name: res.name,
    };
  }

  /**
   * Resolves a region name from region_id.
   */
  getRegionName(regionId: number): string {
    return this.resolveRegion(regionId).name;
  }

  /**
   * Resolves a route exclusively from the canonical SDE-backed universe graph.
   *
   * SAFE is the conservative default for trade transport. Consumers performing
   * EVE order_range accessibility checks must request SHORTEST explicitly.
   */
  getRoute(
    fromSystemId: number,
    toSystemId: number,
    policy: RoutePolicy = 'SAFE',
  ): JumpRoute {
    const graph = this.graphRepository.getGraph();

    // Preserve the public UNKNOWN contract without asking RouteIndex to build
    // an index for a destination that is not part of the canonical graph.
    if (!graph.has_system(fromSystemId) || !graph.has_system(toSystemId)) {
      return unknownRouteToJumpRoute(
        fromSystemId,
        toSystemId,
        graph.provenance,
        'Source or destination system is not present in the canonical graph',
      );
    }

    const index = this.getRouteIndex(toSystemId, policy);
    return this.getIndexedRoute(index, fromSystemId);
  }

  getRouteIndex(
    destinationSystemId: number,
    policy: RoutePolicy = 'SHORTEST',
  ): RouteIndex {
    const graph = this.graphRepository.getGraph();
    const graphIdentity = `${graph.provenance.graph_version}:${graph.provenance.graph_checksum}`;
    const key = `${graphIdentity}:${policy}:${destinationSystemId}`;
    const existing = this.routeIndexCache.get(key);
    if (existing) return existing;

    const index = this.graphRepository.createRouteIndex(destinationSystemId, policy);
    this.routeIndexCache.set(key, index);
    return index;
  }

  getIndexedRoute(index: RouteIndex, fromSystemId: number): JumpRoute {
    const result = index.getRouteFrom(fromSystemId);
    if (result.status === 'FOUND') {
      const certification = certifyRoute(
        this.graphRepository.getGraph(),
        result,
        { requireSafe: index.route_policy === 'SAFE' },
      );
      if (certification.status === 'CERTIFIED' && certification.route) {
        return certifiedRouteToJumpRoute(certification.route);
      }
    }

    return unknownRouteToJumpRoute(
      fromSystemId,
      index.destination_system_id,
      this.graphRepository.getGraph().provenance,
      result.error ?? `Indexed route is not certifiable under policy ${index.route_policy}`,
    );
  }

  getIntegrity(): UniverseValidationResult {
    return this.integrity;
  }

  /**
   * Resolves any New Eden station or Upwell structure asynchronously with strict provenance.
   */
  async resolveLocation(locationId: number, accessToken?: string): Promise<LocationResolutionResult> {
    const canonical = this.locationCache.get(locationId);
    if (canonical) return canonical;

    const dynamic = this.dynamicLocationCache.get(locationId);
    if (dynamic && dynamic.status !== 'LOCATION_FALLBACK' && dynamic.status !== 'LOCATION_UNKNOWN') {
      return dynamic;
    }

    const isStructure = locationId > 100000000;

    try {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch(`/api/universe/location/${locationId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.name) {
          const sys = data.system_id ? this.systemMap.get(data.system_id) : undefined;
          const rName = sys ? this.regionMap.get(sys.region_id) : undefined;
          const resolution: LocationResolutionResult = {
            status: isStructure ? 'RESOLVED_STRUCTURE' : 'RESOLVED_ESI',
            location_id: locationId,
            name: data.name,
            system_id: data.system_id,
            system_name: sys?.name,
            region_id: sys?.region_id,
            region_name: rName,
            security_status: sys?.security,
            is_structure: isStructure,
            is_hub: false,
            source: isStructure ? 'structure_cache' : 'esi_resolved',
            is_verified: Boolean(data.system_id && sys),
            confidence: Boolean(data.system_id && sys) ? (isStructure ? 0.95 : 0.90) : 0,
            provenance: {
              source: 'esi',
              dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
              dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
              loaded_at: new Date().toISOString(),
              verified: Boolean(data.system_id && sys),
              confidence: Boolean(data.system_id && sys) ? (isStructure ? 0.95 : 0.90) : 0,
              completeness: sys ? 'complete' : 'partial',
              scope: isStructure ? 'upwell_structure' : 'esi_station',
            },
          };
          this.dynamicLocationCache.set(locationId, resolution);
          return resolution;
        }
      }
    } catch (err) {
      console.warn(`UniverseRepository: failed to resolve location ${locationId}:`, err);
    }

    const fallback: LocationResolutionResult = {
      status: 'LOCATION_UNKNOWN',
      location_id: locationId,
      name: isStructure ? `Structure #${locationId}` : `Station #${locationId}`,
      is_structure: isStructure,
      is_hub: false,
      source: 'fallback',
      is_verified: false,
      confidence: 0.0,
      error: `Could not resolve location ID ${locationId} via ESI or universe dataset`,
      provenance: {
        source: 'unknown',
        dataset_version: CANONICAL_UNIVERSE_MANIFEST.version,
        dataset_checksum: CANONICAL_UNIVERSE_MANIFEST.checksum,
        loaded_at: new Date().toISOString(),
        verified: false,
        confidence: 0,
        completeness: 'unknown',
      },
    };
    this.locationCache.set(locationId, fallback);
    return fallback;
  }
}
