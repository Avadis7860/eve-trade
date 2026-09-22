import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const NEW_EDEN_SYSTEM_MIN = 30_000_000;
export const NEW_EDEN_SYSTEM_MAX = 30_999_999;
export const UNIVERSE_GRAPH_GENERATOR_VERSION = '2.7C.1';
export const NEW_EDEN_ROUTE_SCOPE = 'new_eden_known_space_v1';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing or invalid ${label}`);
  }
  return value;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return parsed;
}

function assertSecurityStatus(value, systemId) {
  const security = Number(value);
  if (!Number.isFinite(security) || security < -1 || security > 1) {
    throw new Error(`Invalid canonical security status for system ${systemId}: ${String(value)}`);
  }
  return security;
}

export function isNewEdenSystem(systemId) {
  return systemId >= NEW_EDEN_SYSTEM_MIN && systemId <= NEW_EDEN_SYSTEM_MAX;
}

export function parseJsonl(content, sourceLabel) {
  const rows = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `Invalid JSONL at ${sourceLabel} line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Invalid JSONL record at ${sourceLabel} line ${index + 1}: expected an object`);
    }

    rows.push(parsed);
  }

  return rows;
}

export function parseSdeSource(content, sourceLabel) {
  return { content, rows: parseJsonl(content, sourceLabel) };
}

function getObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return value;
}

function readIntegerArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}: expected an array`);
  return value.map((entry) => parsePositiveInteger(entry, label));
}

export function buildUniverseGraphFromSde(input) {
  const datasetVersion = assertNonEmptyString(input.dataset_version, 'SDE dataset version');
  const systemsSource = parseSdeSource(input.mapSolarSystemsContent, 'mapSolarSystems.jsonl');
  const stargatesSource = parseSdeSource(input.mapStargatesContent, 'mapStargates.jsonl');
  const systems = systemsSource.rows;
  const stargates = stargatesSource.rows;

  const nodes = [];
  const nodeIds = new Set();
  const declaredStargatesBySystem = new Map();

  for (const system of systems) {
    const systemId = parsePositiveInteger(system._key, 'solar system ID');
    if (!isNewEdenSystem(systemId)) continue;

    if (nodeIds.has(systemId)) {
      throw new Error(`Duplicate New Eden system ID: ${systemId}`);
    }

    nodeIds.add(systemId);
    nodes.push({
      system_id: systemId,
      security_status: assertSecurityStatus(system.securityStatus, systemId),
    });

    if (system.stargateIDs !== undefined) {
      const declaredIds = readIntegerArray(
        system.stargateIDs,
        `stargateIDs for system ${systemId}`,
      );
      declaredStargatesBySystem.set(systemId, new Set(declaredIds));
    }
  }

  if (nodes.length === 0) {
    throw new Error(
      `SDE contains no New Eden solar systems in the ${NEW_EDEN_SYSTEM_MIN}..${NEW_EDEN_SYSTEM_MAX} range`,
    );
  }

  nodes.sort((a, b) => a.system_id - b.system_id);

  const edges = [];
  const edgeKeys = new Set();
  const stargateIds = new Set();
  const stargateById = new Map();

  for (const gate of stargates) {
    const gateId = parsePositiveInteger(gate._key, 'stargate ID');
    if (stargateIds.has(gateId)) {
      throw new Error(`Duplicate stargate ID: ${gateId}`);
    }

    const from = parsePositiveInteger(
      gate.solarSystemID,
      `stargate ${gateId} source system ID`,
    );
    const destination = getObject(gate.destination, `stargate ${gateId} destination`);
    const to = parsePositiveInteger(
      destination.solarSystemID,
      `stargate ${gateId} destination solar system ID`,
    );

    const fromInScope = isNewEdenSystem(from);
    const toInScope = isNewEdenSystem(to);

    if (!fromInScope && !toInScope) continue;

    if (!fromInScope || !toInScope) {
      throw new Error(
        `Stargate ${gateId} crosses the New Eden graph boundary: ${from} -> ${to}`,
      );
    }

    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      throw new Error(
        `Stargate ${gateId} references a New Eden system absent from mapSolarSystems: ${from} -> ${to}`,
      );
    }

    if (from === to) {
      throw new Error(`Stargate ${gateId} is a self-loop in system ${from}`);
    }

    const destinationGateId = parsePositiveInteger(
      destination.stargateID,
      `stargate ${gateId} destination stargate ID`,
    );

    const key = `${from}:${to}`;
    if (edgeKeys.has(key)) {
      throw new Error(`Duplicate canonical stargate edge: ${from} -> ${to}`);
    }

    edgeKeys.add(key);
    edges.push({ from_system_id: from, to_system_id: to });

    stargateIds.add(gateId);
    stargateById.set(gateId, {
      from_system_id: from,
      to_system_id: to,
      destination_stargate_id: destinationGateId,
    });
  }

  const missingReverseEdges = edges.filter(
    (edge) => !edgeKeys.has(`${edge.to_system_id}:${edge.from_system_id}`),
  );
  if (missingReverseEdges.length > 0) {
    const first = missingReverseEdges[0];
    throw new Error(
      `Canonical New Eden stargate topology is not symmetric: missing reverse edge ${first.from_system_id} -> ${first.to_system_id}`,
    );
  }

  for (const [systemId, declaredIds] of declaredStargatesBySystem) {
    const actualIds = [...stargateById.entries()]
      .filter(([, endpoint]) => endpoint.from_system_id === systemId)
      .map(([gateId]) => gateId)
      .sort((a, b) => a - b);

    const expectedIds = [...declaredIds].sort((a, b) => a - b);

    if (
      actualIds.length !== expectedIds.length ||
      actualIds.some((id, index) => id !== expectedIds[index])
    ) {
      throw new Error(
        `SDE stargateIDs mismatch for system ${systemId}: declared=${expectedIds.join(',')} actual=${actualIds.join(',')}`,
      );
    }
  }

  for (const [gateId, endpoint] of stargateById) {
    const destinationGate = stargateById.get(endpoint.destination_stargate_id);
    if (!destinationGate) {
      throw new Error(
        `Invalid reciprocal stargate reference: ${gateId} -> ${endpoint.destination_stargate_id} does not exist`,
      );
    }

    if (
      destinationGate.from_system_id !== endpoint.to_system_id ||
      destinationGate.to_system_id !== endpoint.from_system_id ||
      destinationGate.destination_stargate_id !== gateId
    ) {
      throw new Error(
        `Invalid reciprocal stargate reference: ${gateId} -> ${endpoint.destination_stargate_id} does not resolve to the inverse topology`,
      );
    }
  }

  edges.sort((a, b) =>
    a.from_system_id - b.from_system_id || a.to_system_id - b.to_system_id,
  );

  const graphChecksum = sha256(JSON.stringify({ nodes, edges }));
  const mapSolarSystemsChecksum = sha256(new TextEncoder().encode(input.mapSolarSystemsContent));
  const mapStargatesChecksum = sha256(new TextEncoder().encode(input.mapStargatesContent));
  const datasetChecksum = sha256(
    JSON.stringify({
      mapSolarSystems: mapSolarSystemsChecksum,
      mapStargates: mapStargatesChecksum,
      route_scope: NEW_EDEN_ROUTE_SCOPE,
    }),
  );
  const graphVersion = `sde-${datasetVersion}`;

  return {
    schema_version: 1,
    graph_version: graphVersion,
    provenance: {
      source: 'sde_canonical',
      dataset_version: datasetVersion,
      dataset_checksum: datasetChecksum,
      graph_checksum: graphChecksum,
      graph_version: graphVersion,
      completeness: 'complete',
      route_scope: NEW_EDEN_ROUTE_SCOPE,
      generator_version: UNIVERSE_GRAPH_GENERATOR_VERSION,
      map_solar_systems_checksum: mapSolarSystemsChecksum,
      map_stargates_checksum: mapStargatesChecksum,
    },
    nodes,
    edges,
  };
}

export async function buildUniverseGraphFromDirectory(sdeDir, datasetVersion) {
  const systemsPath = join(sdeDir, 'mapSolarSystems.jsonl');
  const stargatesPath = join(sdeDir, 'mapStargates.jsonl');

  const [systems, stargates] = await Promise.all([
    readFile(systemsPath, 'utf8'),
    readFile(stargatesPath, 'utf8'),
  ]);

  return buildUniverseGraphFromSde({
    dataset_version: datasetVersion,
    mapSolarSystemsContent: systems,
    mapStargatesContent: stargates,
  });
}

export async function writeUniverseGraphArtifact(artifact, outputPath) {
  const serialized = JSON.stringify(artifact, null, 2) + '\n';
  await writeFile(outputPath, serialized, 'utf8');
  return { artifactSha256: sha256(new TextEncoder().encode(serialized)) };
}
