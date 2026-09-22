import { UniverseGraph, UniverseGraphInput, buildUniverseGraph } from './UniverseGraph';
import { calculateUniverseGraphChecksum } from './UniverseGraphHash';

export interface CanonicalUniverseGraphSource {
  load(): UniverseGraphInput;
}

function assertCanonicalProvenance(input: UniverseGraphInput): void {
  const provenance = input.provenance;

  if (provenance.source !== 'sde_canonical') {
    throw new Error('Universe graph source is not canonical SDE data');
  }
  if (!provenance.dataset_version.trim()) {
    throw new Error('Universe graph dataset version is missing');
  }
  if (!provenance.dataset_checksum.trim()) {
    throw new Error('Universe graph dataset checksum is missing');
  }
  if (!provenance.graph_version.trim()) {
    throw new Error('Universe graph version is missing');
  }
  if (!provenance.graph_checksum.trim()) {
    throw new Error('Universe graph checksum is missing');
  }
}

export class UniverseGraphRepository {
  private readonly graph: UniverseGraph;

  constructor(source: CanonicalUniverseGraphSource) {
    const input = source.load();
    assertCanonicalProvenance(input);
    const calculatedGraphChecksum = calculateUniverseGraphChecksum(input.nodes, input.edges);
    if (calculatedGraphChecksum !== input.provenance.graph_checksum) {
      throw new Error(
        `Universe graph checksum mismatch: expected ${input.provenance.graph_checksum}, calculated ${calculatedGraphChecksum}`,
      );
    }
    this.graph = buildUniverseGraph(input);
  }

  getGraph(): UniverseGraph {
    return this.graph;
  }
}
