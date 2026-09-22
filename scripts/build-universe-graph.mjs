#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const NEW_EDEN_SYSTEM_MIN = 30_000_000;
const NEW_EDEN_SYSTEM_MAX = 30_999_999;

const [, , sdeDir, outputPath, datasetVersion] = process.argv;

if (!sdeDir || !outputPath || !datasetVersion) {
  console.error('Usage: node scripts/build-universe-graph.mjs <sde-directory> <output-json> <sde-build>');
  process.exit(1);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isNewEdenSystem(systemId) {
  return systemId >= NEW_EDEN_SYSTEM_MIN && systemId <= NEW_EDEN_SYSTEM_MAX;
}

function parseInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

async function readJsonl(path) {
  const content = await readFile(path, 'utf8');
  return {
    content,
    rows: content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid JSONL at ${path} line ${index + 1}: ${error.message}`);
        }
      }),
  };
}

const systemsPath = join(sdeDir, 'mapSolarSystems.jsonl');
const stargatesPath = join(sdeDir, 'mapStargates.jsonl');
const systemsFile = await readJsonl(systemsPath);
const stargatesFile = await readJsonl(stargatesPath);

const nodes = systemsFile.rows
  .map((system) => ({
    system_id: parseInteger(system._key, 'solar system ID'),
    security_status: Number(system.securityStatus),
  }))
  .filter((system) => isNewEdenSystem(system.system_id))
  .sort((a, b) => a.system_id - b.system_id);

if (nodes.length === 0) {
  throw new Error('SDE contains no New Eden solar systems in the 30,000,000..30,999,999 range');
}

for (const node of nodes) {
  if (!Number.isFinite(node.security_status) || node.security_status < -1 || node.security_status > 1) {
    throw new Error(`Invalid canonical security status for system ${node.system_id}: ${node.security_status}`);
  }
}

const duplicateNodeIds = nodes.filter((node, index) => index > 0 && node.system_id === nodes[index - 1].system_id);
if (duplicateNodeIds.length > 0) {
  throw new Error(`Duplicate New Eden system ID: ${duplicateNodeIds[0].system_id}`);
}

const securityBySystem = new Map(nodes.map((node) => [node.system_id, node.security_status]));
const systemIds = new Set(nodes.map((node) => node.system_id));
const edges = [];
const edgeKeys = new Set();

for (const gate of stargatesFile.rows) {
  const from = parseInteger(gate.solarSystemID, 'stargate source system ID');
  const to = parseInteger(gate.destination?.solarSystemID, 'stargate destination system ID');
  const fromInScope = isNewEdenSystem(from);
  const toInScope = isNewEdenSystem(to);

  if (!fromInScope && !toInScope) continue;
  if (!fromInScope || !toInScope) {
    throw new Error(`Stargate ${gate._key} crosses the New Eden graph boundary: ${from} -> ${to}`);
  }
  if (!systemIds.has(from) || !systemIds.has(to)) {
    throw new Error(`Stargate ${gate._key} references a New Eden system absent from mapSolarSystems: ${from} -> ${to}`);
  }
  if (from === to) {
    throw new Error(`Stargate ${gate._key} is a self-loop in system ${from}`);
  }
  if (!Number.isFinite(securityBySystem.get(from)) || !Number.isFinite(securityBySystem.get(to))) {
    throw new Error(`Stargate ${gate._key} references a system without finite canonical security status`);
  }

  const key = `${from}:${to}`;
  if (!edgeKeys.has(key)) {
    edgeKeys.add(key);
    edges.push({ from_system_id: from, to_system_id: to });
  }
}

edges.sort((a, b) => a.from_system_id - b.from_system_id || a.to_system_id - b.to_system_id);

const missingReverseEdges = edges.filter(
  (edge) => !edgeKeys.has(`${edge.to_system_id}:${edge.from_system_id}`),
);
if (missingReverseEdges.length > 0) {
  throw new Error(
    `Canonical New Eden stargate topology is not symmetric: ${missingReverseEdges.length} directed edges have no reverse edge`,
  );
}

const canonicalPayload = JSON.stringify({ nodes, edges });
const graphChecksum = sha256(canonicalPayload);
const datasetChecksum = sha256(
  JSON.stringify({
    mapSolarSystems: sha256(systemsFile.content),
    mapStargates: sha256(stargatesFile.content),
    route_scope: 'new_eden_known_space_v1',
  }),
);

const artifact = {
  schema_version: 1,
  graph_version: `sde-${datasetVersion}`,
  provenance: {
    source: 'sde_canonical',
    dataset_version: datasetVersion,
    dataset_checksum: datasetChecksum,
    graph_checksum: graphChecksum,
    graph_version: `sde-${datasetVersion}`,
    completeness: 'complete',
  },
  nodes,
  edges,
};

await writeFile(outputPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

console.log(
  JSON.stringify(
    {
      dataset_version: datasetVersion,
      dataset_checksum: datasetChecksum,
      route_scope: 'new_eden_known_space_v1',
      systems: nodes.length,
      directed_edges: edges.length,
      graph_checksum: graphChecksum,
      output: outputPath,
    },
    null,
    2,
  ),
);
