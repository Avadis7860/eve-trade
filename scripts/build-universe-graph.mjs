#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [, , sdeDir, outputPath, datasetVersion] = process.argv;

if (!sdeDir || !outputPath || !datasetVersion) {
  console.error('Usage: node scripts/build-universe-graph.mjs <sde-directory> <output-json> <sde-build>');
  process.exit(1);
}

async function readJsonl(path) {
  const content = await readFile(path, 'utf8');
  return content
    .split(/\\r?\\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(\`Invalid JSONL at \${path} line \${index + 1}: \${error.message}\`);
      }
    });
}

const systems = await readJsonl(join(sdeDir, 'mapSolarSystems.jsonl'));
const stargates = await readJsonl(join(sdeDir, 'mapStargates.jsonl'));

const nodes = systems
  .map((system) => ({
    system_id: Number(system._key),
    security_status: Number(system.securityStatus),
  }))
  .sort((a, b) => a.system_id - b.system_id);

const systemIds = new Set(nodes.map((node) => node.system_id));
const edges = [];
const edgeKeys = new Set();

for (const gate of stargates) {
  const from = Number(gate.solarSystemID);
  const to = Number(gate.destination?.solarSystemID);

  if (!systemIds.has(from) || !systemIds.has(to)) {
    throw new Error(\`Stargate \${gate._key} references unknown system \${from} -> \${to}\`);
  }
  if (from === to) {
    throw new Error(\`Stargate \${gate._key} is a self-loop in system \${from}\`);
  }
  if (!Number.isFinite(nodes.find((node) => node.system_id === from)?.security_status)) {
    throw new Error(\`System \${from} has no finite canonical security status\`);
  }
  if (!Number.isFinite(nodes.find((node) => node.system_id === to)?.security_status)) {
    throw new Error(\`System \${to} has no finite canonical security status\`);
  }

  const key = \`\${from}:\${to}\`;
  if (!edgeKeys.has(key)) {
    edgeKeys.add(key);
    edges.push({ from_system_id: from, to_system_id: to });
  }
}

edges.sort((a, b) => a.from_system_id - b.from_system_id || a.to_system_id - b.to_system_id);

const missingReverseEdges = edges.filter(
  (edge) => !edgeKeys.has(\`\${edge.to_system_id}:\${edge.from_system_id}\`),
);
if (missingReverseEdges.length > 0) {
  throw new Error(
    \`Canonical stargate topology is not symmetric: \${missingReverseEdges.length} directed edges have no reverse edge\`,
  );
}

const canonicalPayload = JSON.stringify({ nodes, edges });
const graphChecksum = createHash('sha256').update(canonicalPayload).digest('hex');

const artifact = {
  schema_version: 1,
  graph_version: \`sde-\${datasetVersion}\`,
  provenance: {
    source: 'sde_canonical',
    dataset_version: datasetVersion,
    dataset_checksum: 'computed-from-canonical-graph-input',
    graph_checksum: graphChecksum,
    graph_version: \`sde-\${datasetVersion}\`,
    completeness: 'complete',
  },
  nodes,
  edges,
};

await writeFile(outputPath, JSON.stringify(artifact, null, 2) + '\\n', 'utf8');

console.log(
  JSON.stringify(
    {
      dataset_version: datasetVersion,
      systems: nodes.length,
      directed_edges: edges.length,
      graph_checksum: graphChecksum,
      output: outputPath,
    },
    null,
    2,
  ),
);
