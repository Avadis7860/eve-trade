import { MarketHub } from '../../types';
import { MAJOR_MARKET_HUBS, KNOWN_STATION_NAMES } from '../../data/universe';
import universeDataRaw from '../../data/universeData.json';

export interface LocationResolution {
  location_id: number;
  name: string;
  system_id?: number;
  system_name?: string;
  region_id?: number;
  region_name?: string;
  is_structure: boolean;
  source: 'hub' | 'static_npc' | 'structure_cache' | 'esi_resolved' | 'fallback';
}

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
  private locationCache = new Map<number, LocationResolution>();
  private hubMap = new Map<string, MarketHub>();
  private stationToHubMap = new Map<number, MarketHub>();
  private systemToHubMap = new Map<number, MarketHub>();
  private regionMap = new Map<number, string>();
  private systemMap = new Map<number, { name: string; region_id: number; security: number }>();
  private stationMap = new Map<number, { name: string; system_id: number; type_id?: number }>();

  private constructor() {
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
          location_id: stId,
          name: stInfo.name,
          system_id: stInfo.system_id,
          system_name: sys?.name,
          region_id: sys?.region_id,
          region_name: rName,
          is_structure: false,
          source: 'static_npc',
        });
      }
    }

    // 4. Seed Hubs (Overriding / prioritizing hub references)
    for (const hub of MAJOR_MARKET_HUBS) {
      this.hubMap.set(hub.id, hub);
      this.stationToHubMap.set(hub.station_id, hub);
      this.systemToHubMap.set(hub.system_id, hub);
      this.locationCache.set(hub.station_id, {
        location_id: hub.station_id,
        name: hub.station,
        system_id: hub.system_id,
        system_name: hub.solar_system,
        region_id: hub.region_id,
        region_name: hub.region,
        is_structure: false,
        source: 'hub',
      });
    }

    // 5. Known station names overlay
    for (const [stIdStr, name] of Object.entries(KNOWN_STATION_NAMES)) {
      const stId = Number(stIdStr);
      const existing = this.locationCache.get(stId);
      if (existing) {
        existing.name = name;
      } else {
        this.locationCache.set(stId, {
          location_id: stId,
          name: name,
          is_structure: false,
          source: 'static_npc',
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
   * Returns all major hubs.
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
   * Resolves synchronous station name if known.
   */
  getStationNameSync(stationId: number): string {
    const loc = this.locationCache.get(stationId);
    if (loc && loc.name) return loc.name;
    const st = this.stationMap.get(stationId);
    if (st && st.name) return st.name;
    const isStructure = stationId >= 1000000000000;
    return isStructure ? `Structure #${stationId}` : `Station #${stationId}`;
  }

  /**
   * Resolves synchronous location if known, otherwise returns a deterministic fallback.
   */
  resolveLocationSync(locationId: number): LocationResolution {
    const cached = this.locationCache.get(locationId);
    if (cached) return cached;

    const st = this.stationMap.get(locationId);
    if (st) {
      const sys = this.systemMap.get(st.system_id);
      const rName = sys ? this.regionMap.get(sys.region_id) : undefined;
      const res: LocationResolution = {
        location_id: locationId,
        name: st.name,
        system_id: st.system_id,
        system_name: sys?.name,
        region_id: sys?.region_id,
        region_name: rName,
        is_structure: false,
        source: 'static_npc',
      };
      this.locationCache.set(locationId, res);
      return res;
    }

    const isStructure = locationId >= 1000000000000;
    const fallback: LocationResolution = {
      location_id: locationId,
      name: isStructure ? `Structure #${locationId}` : `Station #${locationId}`,
      is_structure: isStructure,
      source: 'fallback',
    };
    this.locationCache.set(locationId, fallback);
    return fallback;
  }

  /**
   * Registers a known structure or citadel into the cache.
   */
  registerStructure(structure: {
    location_id: number;
    name: string;
    system_id?: number;
    system_name?: string;
    region_id?: number;
    region_name?: string;
  }): void {
    const resolution: LocationResolution = {
      location_id: structure.location_id,
      name: structure.name,
      system_id: structure.system_id,
      system_name: structure.system_name,
      region_id: structure.region_id,
      region_name: structure.region_name,
      is_structure: true,
      source: 'structure_cache',
    };
    this.locationCache.set(structure.location_id, resolution);
  }

  /**
   * Resolves station domain entity synchronously.
   */
  getStation(stationId: number): LocationResolution {
    return this.resolveLocationSync(stationId);
  }

  /**
   * Resolves solar system domain entity.
   */
  getSystem(systemId: number): SystemInfo {
    const hub = this.systemToHubMap.get(systemId);
    if (hub) {
      return {
        system_id: hub.system_id,
        name: hub.solar_system,
        region_id: hub.region_id,
        region_name: hub.region,
        security_status: hub.security_status,
      };
    }
    const sys = this.systemMap.get(systemId);
    if (sys) {
      return {
        system_id: systemId,
        name: sys.name,
        region_id: sys.region_id,
        region_name: this.regionMap.get(sys.region_id),
        security_status: sys.security,
      };
    }
    for (const loc of this.locationCache.values()) {
      if (loc.system_id === systemId) {
        return {
          system_id: systemId,
          name: loc.system_name || `System #${systemId}`,
          region_id: loc.region_id,
          region_name: loc.region_name,
        };
      }
    }
    return {
      system_id: systemId,
      name: `System #${systemId}`,
    };
  }

  /**
   * Resolves solar system name synchronously.
   */
  getSystemName(systemId: number): string {
    return this.getSystem(systemId).name;
  }

  /**
   * Resolves region domain entity.
   */
  getRegion(regionId: number): RegionInfo {
    const name = this.regionMap.get(regionId) || `Region #${regionId}`;
    return {
      region_id: regionId,
      name,
    };
  }

  /**
   * Resolves a region name from region_id.
   */
  getRegionName(regionId: number): string {
    return this.getRegion(regionId).name;
  }

  /**
   * Resolves any New Eden station or Upwell structure asynchronously.
   */
  async resolveLocation(locationId: number, accessToken?: string): Promise<LocationResolution> {
    const cached = this.locationCache.get(locationId);
    if (cached && cached.source !== 'fallback') return cached;

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
          const resolution: LocationResolution = {
            location_id: locationId,
            name: data.name,
            system_id: data.system_id,
            is_structure: isStructure,
            source: isStructure ? 'structure_cache' : 'esi_resolved',
          };
          this.locationCache.set(locationId, resolution);
          return resolution;
        }
      }
    } catch (err) {
      console.warn(`UniverseRepository: failed to resolve location ${locationId}:`, err);
    }

    const fallback: LocationResolution = {
      location_id: locationId,
      name: isStructure ? `Structure #${locationId}` : `Station #${locationId}`,
      is_structure: isStructure,
      source: 'fallback',
    };
    this.locationCache.set(locationId, fallback);
    return fallback;
  }
}

