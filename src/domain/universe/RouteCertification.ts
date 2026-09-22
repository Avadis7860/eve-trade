import { RouteEngineResult, RouteSafety, SAFE_ROUTE_MIN_SECURITY } from './RouteEngine';
import { UniverseGraph } from './UniverseGraph';

export interface CertifiedJumpRoute {
  readonly from_system_id: number;
  readonly to_system_id: number;
  readonly jumps: number;
  readonly systems: readonly number[];
  readonly security_statuses: Readonly<Record<number, number>>;
  readonly safety: RouteSafety;
  readonly route_status: 'CERTIFIED';
  readonly graph_version: string;
  readonly graph_checksum: string;
  readonly provenance: UniverseGraph['provenance'];
}

export type RouteCertificationStatus = 'CERTIFIED' | 'REJECTED';

export interface RouteCertificationResult {
  readonly status: RouteCertificationStatus;
  readonly route?: CertifiedJumpRoute;
  readonly error?: string;
}

export function certifyRoute(
  graph: UniverseGraph,
  result: RouteEngineResult,
  options: { requireSafe?: boolean } = {},
): RouteCertificationResult {
  if (result.status !== 'FOUND') {
    return { status: 'REJECTED', error: \`Route is not certifiable: \${result.status}\` };
  }
  if (result.systems.length === 0 || result.systems[0] !== result.from_system_id) {
    return { status: 'REJECTED', error: 'Route path does not start at the requested source system' };
  }
  if (result.systems[result.systems.length - 1] !== result.to_system_id) {
    return { status: 'REJECTED', error: 'Route path does not end at the requested destination system' };
  }
  if (result.jumps !== result.systems.length - 1) {
    return { status: 'REJECTED', error: 'Route jump count does not match the certified path' };
  }

  const securityStatuses: Record<number, number> = {};
  for (let index = 0; index < result.systems.length; index += 1) {
    const systemId = result.systems[index];
    const node = graph.get_node(systemId);
    if (!node) {
      return { status: 'REJECTED', error: \`Route references unknown system \${systemId}\` };
    }
    if (index > 0 && !graph.has_edge(result.systems[index - 1], systemId)) {
      return {
        status: 'REJECTED',
        error: \`Route contains a non-existent stargate edge at \${result.systems[index - 1]} -> \${systemId}\`,
      };
    }
    if (node.security_status === null) {
      return { status: 'REJECTED', error: \`Route security is UNKNOWN for system \${systemId}\` };
    }
    securityStatuses[systemId] = node.security_status;
  }

  const recomputedSafety: RouteSafety = Object.values(securityStatuses).every(
    (security) => security >= SAFE_ROUTE_MIN_SECURITY,
  )
    ? 'SAFE'
    : 'NON_SAFE';

  if (recomputedSafety !== result.safety) {
    return { status: 'REJECTED', error: 'Route safety classification does not match canonical system security' };
  }
  if (options.requireSafe && recomputedSafety !== 'SAFE') {
    return { status: 'REJECTED', error: 'Safe route requested but the certified path is not safe' };
  }

  return {
    status: 'CERTIFIED',
    route: Object.freeze({
      from_system_id: result.from_system_id,
      to_system_id: result.to_system_id,
      jumps: result.jumps!,
      systems: Object.freeze([...result.systems]),
      security_statuses: Object.freeze({ ...securityStatuses }),
      safety: recomputedSafety,
      route_status: 'CERTIFIED',
      graph_version: graph.provenance.graph_version,
      graph_checksum: graph.provenance.graph_checksum,
      provenance: graph.provenance,
    }),
  };
}
