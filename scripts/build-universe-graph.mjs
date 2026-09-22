#!/usr/bin/env node

import { buildUniverseGraphFromDirectory, writeUniverseGraphArtifact } from './universe-graph-builder.mjs';

const [, , sdeDir, outputPath, datasetVersion] = process.argv;

if (!sdeDir || !outputPath || !datasetVersion) {
  console.error(
    'Usage: node scripts/build-universe-graph.mjs <sde-directory> <output-json> <sde-build>',
  );
  process.exit(1);
}

try {
  const artifact = await buildUniverseGraphFromDirectory(sdeDir, datasetVersion);
  const { artifactSha256 } = await writeUniverseGraphArtifact(artifact, outputPath);

  console.log(
    JSON.stringify(
      {
        dataset_version: artifact.provenance.dataset_version,
        dataset_checksum: artifact.provenance.dataset_checksum,
        route_scope: artifact.provenance.route_scope,
        generator_version: artifact.provenance.generator_version,
        systems: artifact.nodes.length,
        directed_edges: artifact.edges.length,
        graph_checksum: artifact.provenance.graph_checksum,
        artifact_sha256: artifactSha256,
        output: outputPath,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
