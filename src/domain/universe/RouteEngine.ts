import { UniverseGraph } from './UniverseGraph';

export const SAFE_ROUTE_MIN_SECURITY = 0.5;

export type RouteStatus = 'FOUND' | 'NO_ROUTE' | 'UNKNOWN';
export type RouteSafety = 'SAFE' | 'NON_SAFE' | 'UNKNOWN';
export type RoutePolicy = 'SHORTEST' | 'SAFE';

export interface RouteEngineResult {
  readonly status: RouteStatus;
  readonly safety: RouteSafety;
  readonly from_system_id: number;
  readonly to_system_id: number;
  readonly systems: readonly number[];
  readonly security_statuses: Readonly<Record<number, number | null>>;
  readonly jumps: number | null;
  readonly graph_provenance: UniverseGraph['provenance'];
  readonly error?: string;
}

function unknownResult(
  graph: UniverseGraph,
  fromSystemId: number,
  toSystemId: number,
  error: string,
): RouteEngineResult {
  return {
    status: 'UNKNOWN',
    safety: 'UNKNOWN',
    from_system_id: fromSystemId,
    to_system_id: toSystemId,
    systems: [],
    security_statuses: {},
    jumps: null,
    graph_provenance: graph.provenance,
    error,
  };
}

function noRouteResult(
  graph: UniverseGraph,
  fromSystemId: number,
  toSystemId: number,
  error: string,
): RouteEngineResult {
  return {
    status: 'NO_ROUTE',
    safety: 'UNKNOWN',
    from_system_id: fromSystemId,
    to_system_id: toSystemId,
    systems: [],
    security_statuses: {},
    jumps: null,
    graph_provenance: graph.provenance,
    error,
  };
}

function securityMap(graph: UniverseGraph, systems: readonly number[]): Readonly<Record<number, number | null>> {
  const result: Record<number, number | null> = {};
  for (const systemId of systems) {
    result[systemId] = graph.get_node(systemId)?.security_status ?? null;
  }
  return Object.freeze(result);
}

function classifySafety(graph: UniverseGraph, systems: readonly number[]): RouteSafety {
  for (const systemId of systems) {
    const security = graph.get_node(systemId)?.security_status ?? null;
    if (security === null) return 'UNKNOWN';
    if (security < SAFE_ROUTE_MIN_SECURITY) return 'NON_SAFE';
  }
  return 'SAFE';
}

function isSystemAllowed(graph: UniverseGraph, systemId: number, policy: RoutePolicy): boolean {
  if (policy === 'SHORTEST') return true;
  const security = graph.get_node(systemId)?.security_status ?? null;
  return security !== null && security >= SAFE_ROUTE_MIN_SECURITY;
}

export class RouteEngine {
  constructor(private readonly graph: UniverseGraph) {}

  findRoute(fromSystemId: number, toSystemId: number): RouteEngineResult {
    return this.findRouteWithPolicy(fromSystemId, toSystemId, 'SHORTEST');
  }

  findSafeRoute(fromSystemId: number, toSystemId: number): RouteEngineResult {
    return this.findRouteWithPolicy(fromSystemId, toSystemId, 'SAFE');
  }

  findRouteWithPolicy(
    fromSystemId: number,
    toSystemId: number,
    policy: RoutePolicy,
  ): RouteEngineResult {
    if (!this.graph.has_system(fromSystemId) || !this.graph.has_system(toSystemId)) {
      return unknownResult(
        this.graph,
        fromSystemId,
        toSystemId,
        'Source or destination system is not present in the canonical graph',
      );
    }

    // A partial graph cannot prove reachability, shortestness, or absence of a
    // shorter/safer path outside the observed subgraph.
    if (this.graph.provenance.completeness !== 'complete') {
      return unknownResult(
        this.graph,
        fromSystemId,
        toSystemId,
        'Route is UNKNOWN because the canonical universe graph is partial',
      );
    }

    if (!isSystemAllowed(this.graph, fromSystemId, policy) ||
        !isSystemAllowed(this.graph, toSystemId, policy)) {
      return noRouteResult(
        this.graph,
        fromSystemId,
        toSystemId,
        `No ${policy.toLowerCase()} route exists because the requested endpoint is not eligible`,
      );
    }

    if (fromSystemId === toSystemId) {
      const systems = [fromSystemId];
      return {
        status: 'FOUND',
        safety: classifySafety(this.graph, systems),
        from_system_id: fromSystemId,
        to_system_id: toSystemId,
        systems,
        security_statuses: securityMap(this.graph, systems),
        jumps: 0,
        graph_provenance: this.graph.provenance,
      };
    }

    const queue: number[] = [fromSystemId];
    const previous = new Map<number, number | null>([[fromSystemId, null]]);

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];

      for (const neighbor of this.graph.neighbors(current)) {
        if (previous.has(neighbor) || !isSystemAllowed(this.graph, neighbor, policy)) continue;

        previous.set(neighbor, current);
        queue.push(neighbor);

        if (neighbor === toSystemId) {
          const systems: number[] = [];
          let cursor: number | null = toSystemId;

          while (cursor !== null) {
            systems.push(cursor);
            cursor = previous.get(cursor) ?? null;
          }

          systems.reverse();

          return {
            status: 'FOUND',
            safety: classifySafety(this.graph, systems),
            from_system_id: fromSystemId,
            to_system_id: toSystemId,
            systems,
            security_statuses: securityMap(this.graph, systems),
            jumps: systems.length - 1,
            graph_provenance: this.graph.provenance,
          };
        }
      }
    }

    return noRouteResult(
      this.graph,
      fromSystemId,
      toSystemId,
      `No ${policy.toLowerCase()} route exists in the canonical stargate graph`,
    );
  }
}
