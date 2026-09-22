#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [, , artifactPath, outputPath] = process.argv;
if (!artifactPath || !outputPath) {
  console.error('Usage: node scripts/write-universe-graph-manifest.mjs <artifact-json> <manifest-ts>');
  process.exit(1);
}

const artifactBytes = await readFile(artifactPath);
const artifact = JSON.parse(artifactBytes.toString('utf8'));
if (artifact?.schema_version !== 1) throw new Error('Unsupported universe graph artifact schema');
if (!artifact?.provenance || artifact.provenance.source !== 'sde_canonical') throw new Error('Artifact lacks canonical SDE provenance');
if (artifact.provenance.completeness !== 'complete') throw new Error('Runtime artifact is not complete');
if (!artifact.provenance.route_scope || !artifact.provenance.generator_version) throw new Error('Artifact provenance lacks route scope or generator version');
if (!artifact.provenance.map_solar_systems_checksum || !artifact.provenance.map_stargates_checksum) throw new Error('Artifact provenance lacks source checksums');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const computedGraphChecksum = sha256(JSON.stringify({ nodes: artifact.nodes, edges: artifact.edges }));
if (computedGraphChecksum !== artifact.provenance.graph_checksum) {
  throw new Error('Artifact graph checksum mismatch before manifest generation');
}

const artifactSha256 = sha256(artifactBytes);
const manifest = `/** Canonical trust manifest for the SDE-backed New Eden universe graph. */\nexport const CANONICAL_UNIVERSE_GRAPH_MANIFEST = Object.freeze({\n  schemaVersion: ${artifact.schema_version},\n  sdeBuild: ${JSON.stringify(artifact.provenance.dataset_version)},\n  graphVersion: ${JSON.stringify(artifact.provenance.graph_version)},\n  routeScope: ${JSON.stringify(artifact.provenance.route_scope)},\n  generatorVersion: ${JSON.stringify(artifact.provenance.generator_version)},\n  mapSolarSystemsChecksum: ${JSON.stringify(artifact.provenance.map_solar_systems_checksum)},\n  mapStargatesChecksum: ${JSON.stringify(artifact.provenance.map_stargates_checksum)},\n  datasetChecksum: ${JSON.stringify(artifact.provenance.dataset_checksum)},\n  graphChecksum: ${JSON.stringify(artifact.provenance.graph_checksum)},\n  systemsCount: ${artifact.nodes.length},\n  directedEdgesCount: ${artifact.edges.length},\n  artifactSha256: ${JSON.stringify(artifactSha256)},\n  source: 'ccp_sde',\n} as const);\n`;

await writeFile(outputPath, manifest, 'utf8');
console.log(JSON.stringify({ sde_build: artifact.provenance.dataset_version, systems: artifact.nodes.length, directed_edges: artifact.edges.length, graph_checksum: artifact.provenance.graph_checksum, artifact_sha256: artifactSha256 }, null, 2));