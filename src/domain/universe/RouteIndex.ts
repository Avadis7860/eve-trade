import { RouteEngine, RouteEngineResult, RoutePolicy, SAFE_ROUTE_MIN_SECURITY } from './RouteEngine';
import { UniverseGraph } from './UniverseGraph';

export class RouteIndex {
  private readonly distances = new Map<number, number>();
  private readonly nextHop = new Map<number, number>();
  private built = false;

  constructor(
    private readonly graph: UniverseGraph,
    private readonly destinationSystemId: number,
    private readonly policy: RoutePolicy = 'SHORTEST',
  ) {}

  get destination_system_id(): number { return this.destinationSystemId; }
  get route_policy(): RoutePolicy { return this.policy; }

  private assertBuildable(): void {
    if (!this.graph.has_system(this.destinationSystemId)) {
      throw new Error('Cannot build route index: destination system ' + this.destinationSystemId + ' is not present in the canonical graph');
    }
    if (this.graph.provenance.completeness !== 'complete') {
      throw new Error('Cannot build route index from a partial canonical graph');
    }
  }

  private isAllowed(systemId: number): boolean {
    if (this.policy === 'SHORTEST') return true;
    const security = this.graph.get_node(systemId)?.security_status ?? null;
    return security !== null && security >= SAFE_ROUTE_MIN_SECURITY;
  }

  private build(): void {
    if (this.built) return;
    this.assertBuildable();
    if (!this.isAllowed(this.destinationSystemId)) { this.built = true; return; }

    const queue: number[] = [this.destinationSystemId];
    this.distances.set(this.destinationSystemId, 0);

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      const currentDistance = this.distances.get(current)!;

      for (const neighbor of this.graph.neighbors(current)) {
        if (this.distances.has(neighbor) || !this.isAllowed(neighbor)) continue;
        this.distances.set(neighbor, currentDistance + 1);
        this.nextHop.set(neighbor, current);
        queue.push(neighbor);
      }
    }
    this.built = true;
  }

  hasRouteFrom(systemId: number): boolean { return this.getDistance(systemId) !== null; }

  getDistance(systemId: number): number | null {
    this.build();
    return this.distances.get(systemId) ?? null;
  }

  getRouteFrom(systemId: number): RouteEngineResult {
    this.build();

    if (!this.graph.has_system(systemId)) {
      return {
        status: 'UNKNOWN', safety: 'UNKNOWN', from_system_id: systemId, to_system_id: this.destinationSystemId,
        systems: [], security_statuses: {}, jumps: null, graph_provenance: this.graph.provenance,
        error: 'Source system is not present in the canonical graph',
      };
    }

    const distance = this.distances.get(systemId);
    if (distance === undefined) {
      return {
        status: 'NO_ROUTE', safety: 'UNKNOWN', from_system_id: systemId, to_system_id: this.destinationSystemId,
        systems: [], security_statuses: {}, jumps: null, graph_provenance: this.graph.provenance,
        error: 'No ' + this.policy.toLowerCase() + ' route exists in the canonical stargate graph',
      };
    }

    const systems: number[] = [systemId];
    let cursor = systemId;
    while (cursor !== this.destinationSystemId) {
      const next = this.nextHop.get(cursor);
      if (next === undefined) throw new Error('Corrupted route index: missing next hop');
      systems.push(next);
      cursor = next;
    }

    const securityStatuses: Record<number, number | null> = {};
    for (const traversedSystemId of systems) {
      securityStatuses[traversedSystemId] = this.graph.get_node(traversedSystemId)?.security_status ?? null;
    }
    const safety = Object.values(securityStatuses).every(
      (security) => security !== null && security >= SAFE_ROUTE_MIN_SECURITY,
    ) ? 'SAFE' : 'NON_SAFE';

    return {
      status: 'FOUND',
      safety,
      from_system_id: systemId,
      to_system_id: this.destinationSystemId,
      systems,
      security_statuses: Object.freeze(securityStatuses),
      jumps: distance,
      graph_provenance: this.graph.provenance,
    };
  }
}

export function createRouteIndex(graph: UniverseGraph, destinationSystemId: number, policy: RoutePolicy = 'SHORTEST'): RouteIndex {
  return new RouteIndex(graph, destinationSystemId, policy);
}

export function assertIndexMatchesEngine(graph: UniverseGraph, index: RouteIndex, sourceSystemId: number): void {
  const indexed = index.getRouteFrom(sourceSystemId);
  const direct = new RouteEngine(graph).findRouteWithPolicy(sourceSystemId, index.destination_system_id, index.route_policy);
  if (indexed.status !== direct.status || indexed.jumps !== direct.jumps) {
    throw new Error(
      'Route index mismatch for ' + sourceSystemId + ' -> ' + index.destination_system_id +
      ': index=' + indexed.status + '/' + indexed.jumps + ', direct=' + direct.status + '/' + direct.jumps,
    );
  }
}
