import type { JumpRoute, UniverseProvenance } from '../../types';
import type { CertifiedJumpRoute } from './RouteCertification';

function buildProvenance(route: CertifiedJumpRoute): UniverseProvenance {
  return {
    source: 'sde_canonical',
    dataset_version: route.provenance.dataset_version,
    dataset_checksum: route.provenance.dataset_checksum,
    loaded_at: new Date().toISOString(),
    verified: true,
    confidence: 1,
    completeness: route.provenance.completeness,
    scope: route.provenance.route_scope ?? 'new_eden_known_space_v1',
  };
}

export function certifiedRouteToJumpRoute(route: CertifiedJumpRoute): JumpRoute {
  const securityValues = Object.values(route.security_statuses);
  if (securityValues.length === 0) throw new Error('Cannot adapt an empty certified route');

  return {
    from_system_id: route.from_system_id,
    to_system_id: route.to_system_id,
    jumps: route.jumps,
    min_security: Math.min(...securityValues),
    is_highsec_only: route.safety === 'SAFE',
    status: 'KNOWN',
    source: 'canonical_graph',
    is_verified: true,
    confidence: 1,
    provenance: buildProvenance(route),
  };
}

export function unknownRouteToJumpRoute(
  fromSystemId: number,
  toSystemId: number,
  provenance: CertifiedJumpRoute['provenance'],
  error: string,
): JumpRoute {
  return {
    from_system_id: fromSystemId,
    to_system_id: toSystemId,
    jumps: -1,
    min_security: -1,
    is_highsec_only: false,
    status: 'UNKNOWN',
    source: 'unknown',
    is_verified: false,
    confidence: 0,
    error,
    provenance: {
      source: 'sde_canonical',
      dataset_version: provenance.dataset_version,
      dataset_checksum: provenance.dataset_checksum,
      loaded_at: new Date().toISOString(),
      verified: false,
      confidence: 0,
      completeness: provenance.completeness,
      scope: provenance.route_scope ?? 'new_eden_known_space_v1',
      error,
    },
  };
}