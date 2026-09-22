import assert from 'node:assert/strict';
import { buildUniverseGraph } from '../../domain/universe/UniverseGraph';
import { RouteEngine } from '../../domain/universe/RouteEngine';
import { certifyRoute } from '../../domain/universe/RouteCertification';

const provenance = {
  source: 'sde_canonical' as const,
  dataset_version: 'test-fixture',
  dataset_checksum: 'fixture-checksum',
  graph_checksum: 'graph-checksum',
  graph_version: 'graph-v1',
  completeness: 'complete' as const,
};

const graph = buildUniverseGraph({
  provenance,
  nodes: [
    { system_id: 1, security_status: 0.9 },
    { system_id: 2, security_status: 0.8 },
    { system_id: 3, security_status: 0.4 },
    { system_id: 4, security_status: 0.7 },
  ],
  edges: [
    { from_system_id: 1, to_system_id: 2 },
    { from_system_id: 2, to_system_id: 1 },
    { from_system_id: 2, to_system_id: 3 },
    { from_system_id: 3, to_system_id: 2 },
    { from_system_id: 3, to_system_id: 4 },
    { from_system_id: 4, to_system_id: 3 },
  ],
});

const engine = new RouteEngine(graph);

const self = engine.findRoute(1, 1);
assert.equal(self.status, 'FOUND');
assert.equal(self.jumps, 0);
assert.deepEqual(self.systems, [1]);
assert.equal(self.safety, 'SAFE');

const multiHop = engine.findRoute(1, 4);
assert.equal(multiHop.status, 'FOUND');
assert.equal(multiHop.jumps, 3);
assert.deepEqual(multiHop.systems, [1, 2, 3, 4]);
assert.deepEqual(multiHop.security_statuses, { 1: 0.9, 2: 0.8, 3: 0.4, 4: 0.7 });
assert.equal(multiHop.safety, 'NON_SAFE');

const reverse = engine.findRoute(4, 1);
assert.equal(reverse.status, 'FOUND');
assert.deepEqual(reverse.systems, [4, 3, 2, 1]);
assert.equal(reverse.jumps, 3);

const certified = certifyRoute(graph, multiHop);
assert.equal(certified.status, 'CERTIFIED');
assert.equal(certified.route?.jumps, 3);
assert.equal(certified.route?.safety, 'NON_SAFE');

const safeRequired = certifyRoute(graph, multiHop, { requireSafe: true });
assert.equal(safeRequired.status, 'REJECTED');

const safeRoute = engine.findRoute(1, 2);
assert.equal(safeRoute.safety, 'SAFE');
assert.equal(certifyRoute(graph, safeRoute, { requireSafe: true }).status, 'CERTIFIED');

const noRouteGraph = buildUniverseGraph({
  provenance,
  nodes: [
    { system_id: 10, security_status: 0.9 },
    { system_id: 20, security_status: 0.9 },
  ],
  edges: [],
});
const noRoute = new RouteEngine(noRouteGraph).findRoute(10, 20);
assert.equal(noRoute.status, 'NO_ROUTE');
assert.equal(noRoute.jumps, null);

const partialGraph = buildUniverseGraph({
  provenance: { ...provenance, completeness: 'partial' },
  nodes: [
    { system_id: 10, security_status: 0.9 },
    { system_id: 20, security_status: 0.9 },
  ],
  edges: [],
});
const unknown = new RouteEngine(partialGraph).findRoute(10, 20);
assert.equal(unknown.status, 'UNKNOWN');
assert.equal(unknown.jumps, null);

const unknownSecurityGraph = buildUniverseGraph({
  provenance,
  nodes: [
    { system_id: 100, security_status: 0.9 },
    { system_id: 200, security_status: null },
  ],
  edges: [{ from_system_id: 100, to_system_id: 200 }],
});
const unknownSecurityRoute = new RouteEngine(unknownSecurityGraph).findRoute(100, 200);
assert.equal(unknownSecurityRoute.status, 'FOUND');
assert.equal(unknownSecurityRoute.safety, 'UNKNOWN');
assert.equal(certifyRoute(unknownSecurityGraph, unknownSecurityRoute).status, 'REJECTED');

const deterministicA = engine.findRoute(1, 4);
const deterministicB = engine.findRoute(1, 4);
assert.deepEqual(deterministicA, deterministicB);

console.log('route_engine.test.ts: OK');
