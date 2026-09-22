import universeGraphRaw from '../../data/universeGraph.json';
import { CANONICAL_UNIVERSE_GRAPH_MANIFEST } from '../../data/universeGraphManifest';
import { UniverseGraph, UniverseGraphInput, buildUniverseGraph } from './UniverseGraph';
import { calculateUniverseGraphChecksum } from './UniverseGraphHash';
import { RouteIndex } from './RouteIndex';
import { RoutePolicy } from './RouteEngine';

export interface CanonicalUniverseGraphSource {
  load(): UniverseGraphInput;
}

type UniverseGraphArtifactInput = UniverseGraphInput & {
  readonly schema_version: number;
};

function assertCanonicalArtifactIdentity(input: UniverseGraphArtifactInput): void {
  const { provenance } = input;
  const manifest = CANONICAL_UNIVERSE_GRAPH_MANIFEST;

  if (input.schema_version !== manifest.schemaVersion) {
    throw new Error('Universe graph schema version does not match the canonical manifest');
  }
  if (provenance.source !== 'sde_canonical') {
    throw new Error('Universe graph source is not canonical SDE data');
  }
  if (provenance.dataset_version !== manifest.sdeBuild) {
    throw new Error('Universe graph SDE build does not match the canonical manifest');
  }
  if (provenance.graph_version !== manifest.graphVersion) {
    throw new Error('Universe graph version does not match the canonical manifest');
  }
  if (provenance.route_scope !== manifest.routeScope) {
    throw new Error('Universe graph route scope does not match the canonical manifest');
  }
  if (provenance.generator_version !== manifest.generatorVersion) {
    throw new Error('Universe graph generator version does not match the canonical manifest');
  }
  if (provenance.dataset_checksum !== manifest.datasetChecksum) {
    throw new Error('Universe graph dataset checksum does not match the canonical manifest');
  }
  if (provenance.graph_checksum !== manifest.graphChecksum) {
    throw new Error('Universe graph checksum does not match the canonical manifest');
  }
  if (provenance.map_solar_systems_checksum !== manifest.mapSolarSystemsChecksum) {
    throw new Error('mapSolarSystems checksum does not match the canonical manifest');
  }
  if (provenance.map_stargates_checksum !== manifest.mapStargatesChecksum) {
    throw new Error('mapStargates checksum does not match the canonical manifest');
  }
  if (provenance.completeness !== 'complete') {
    throw new Error('Canonical runtime universe graph must be complete');
  }
  if (input.nodes.length !== manifest.systemsCount || input.edges.length !== manifest.directedEdgesCount) {
    throw new Error('Universe graph cardinality does not match the canonical manifest');
  }
}

function assertCanonicalProvenance(input: UniverseGraphInput): void {
  const provenance = input.provenance;
  if (!provenance.dataset_version?.trim()) throw new Error('Universe graph dataset version is missing');
  if (!provenance.dataset_checksum?.trim()) throw new Error('Universe graph dataset checksum is missing');
  if (!provenance.graph_version?.trim()) throw new Error('Universe graph version is missing');
  if (!provenance.graph_checksum?.trim()) throw new Error('Universe graph checksum is missing');
}

const DEFAULT_CANONICAL_SOURCE: CanonicalUniverseGraphSource = {
  load: () => universeGraphRaw as unknown as UniverseGraphArtifactInput,
};

export class UniverseGraphRepository {
  private readonly graph: UniverseGraph;

  constructor(source: CanonicalUniverseGraphSource = DEFAULT_CANONICAL_SOURCE) {
    const input = source.load();
    assertCanonicalProvenance(input);
    if ('schema_version' in input) assertCanonicalArtifactIdentity(input as UniverseGraphArtifactInput);
    const calculatedGraphChecksum = calculateUniverseGraphChecksum(input.nodes, input.edges);
    if (calculatedGraphChecksum !== input.provenance.graph_checksum) {
      throw new Error(
        'Universe graph checksum mismatch: expected ' + input.provenance.graph_checksum + ', calculated ' + calculatedGraphChecksum,
      );
    }
    this.graph = buildUniverseGraph(input);
  }

  getGraph(): UniverseGraph {
    return this.graph;
  }

  createRouteIndex(destinationSystemId: number, policy: RoutePolicy = 'SHORTEST'): RouteIndex {
    return new RouteIndex(this.graph, destinationSystemId, policy);
  }
}