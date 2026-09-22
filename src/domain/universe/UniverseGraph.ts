export type GraphCompleteness = 'complete' | 'partial';

export interface UniverseGraphNode {
  readonly system_id: number;
  /** null is explicit UNKNOWN; it is never interpreted as zero or safe. */
  readonly security_status: number | null;
}

export interface UniverseGraphEdge {
  readonly from_system_id: number;
  readonly to_system_id: number;
}

export interface UniverseGraphProvenance {
  readonly source: 'sde_canonical';
  readonly dataset_version: string;
  readonly dataset_checksum: string;
  readonly graph_checksum: string;
  readonly graph_version: string;
  readonly completeness: GraphCompleteness;
}

export interface UniverseGraphInput {
  readonly nodes: readonly UniverseGraphNode[];
  readonly edges: readonly UniverseGraphEdge[];
  readonly provenance: UniverseGraphProvenance;
}

export interface UniverseGraph {
  readonly provenance: UniverseGraphProvenance;
  readonly node_count: number;
  readonly edge_count: number;
  readonly has_system: (system_id: number) => boolean;
  readonly get_node: (system_id: number) => UniverseGraphNode | undefined;
  readonly neighbors: (system_id: number) => readonly number[];
  readonly has_edge: (from_system_id: number, to_system_id: number) => boolean;
}

function assertSystemId(systemId: number, label: string): void {
  if (!Number.isInteger(systemId) || systemId <= 0) {
    throw new Error(`Invalid ${label} system ID: ${systemId}`);
  }
}

function assertSecurityStatus(securityStatus: number | null): void {
  if (securityStatus !== null && (!Number.isFinite(securityStatus) || securityStatus < -1 || securityStatus > 1)) {
    throw new Error(`Invalid security status: ${securityStatus}`);
  }
}

export function buildUniverseGraph(input: UniverseGraphInput): UniverseGraph {
  const nodes = new Map<number, UniverseGraphNode>();
  const adjacency = new Map<number, Set<number>>();

  for (const node of input.nodes) {
    assertSystemId(node.system_id, 'node');
    assertSecurityStatus(node.security_status);
    if (nodes.has(node.system_id)) {
      throw new Error(`Duplicate universe graph node: ${node.system_id}`);
    }
    nodes.set(node.system_id, Object.freeze({ ...node }));
    adjacency.set(node.system_id, new Set());
  }

  let edgeCount = 0;

  for (const edge of input.edges) {
    assertSystemId(edge.from_system_id, 'edge source');
    assertSystemId(edge.to_system_id, 'edge destination');

    if (edge.from_system_id === edge.to_system_id) {
      throw new Error(`Self-loop is not a canonical stargate edge: ${edge.from_system_id}`);
    }
    if (!nodes.has(edge.from_system_id) || !nodes.has(edge.to_system_id)) {
      throw new Error(
        `Universe graph edge references unknown system: ${edge.from_system_id} -> ${edge.to_system_id}`,
      );
    }

    const neighbors = adjacency.get(edge.from_system_id)!;
    if (neighbors.has(edge.to_system_id)) continue;
    neighbors.add(edge.to_system_id);
    edgeCount += 1;
  }

  const frozenAdjacency = new Map<number, readonly number[]>();
  for (const [systemId, neighbors] of adjacency) {
    frozenAdjacency.set(systemId, Object.freeze([...neighbors].sort((a, b) => a - b)));
  }

  return Object.freeze({
    provenance: Object.freeze({ ...input.provenance }),
    node_count: nodes.size,
    edge_count: edgeCount,
    has_system: (systemId: number) => nodes.has(systemId),
    get_node: (systemId: number) => nodes.get(systemId),
    neighbors: (systemId: number) => frozenAdjacency.get(systemId) ?? [],
    has_edge: (fromSystemId: number, toSystemId: number) =>
      Boolean(frozenAdjacency.get(fromSystemId)?.includes(toSystemId)),
  });
}
