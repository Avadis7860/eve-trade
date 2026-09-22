import assert from 'node:assert/strict';
import { buildUniverseGraph } from '../../domain/universe/UniverseGraph';
import { RouteEngine } from '../../domain/universe/RouteEngine';
import { certifyRoute } from '../../domain/universe/RouteCertification';
import { UniverseGraphRepository } from '../../domain/universe/UniverseGraphRepository';
import { calculateUniverseGraphChecksum } from '../../domain/universe/UniverseGraphHash';
import { RouteIndex } from '../../domain/universe/RouteIndex';

const repositoryNodes = [
  { system_id: 1, security_status: 0.9 },
  { system_id: 2, security_status: 0.8 },
];
const repositoryEdges = [
  { from_system_id: 1, to_system_id: 2 },
  { from_system_id: 2, to_system_id: 1 },
];

assert.equal(
  calculateUniverseGraphChecksum(repositoryNodes, repositoryEdges),
  '5bdd5e4ff041e41fef78453c294fd73adc732e20de745dfb77e2cba14d56776d',
);

const provenance = {
  source: 'sde_canonical' as const,
  dataset_version: 'test-fixture',
  dataset_checksum: 'fixture-checksum',
  graph_checksum: calculateUniverseGraphChecksum(repositoryNodes, repositoryEdges),
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
const graphRepository = new UniverseGraphRepository({
  load: () => ({
    provenance,
    nodes: repositoryNodes,
    edges: repositoryEdges,
  }),
});
assert.equal(graphRepository.getGraph().node_count, 2);

assert.throws(
  () =>
    new UniverseGraphRepository({
      load: () => ({
        provenance: { ...provenance, graph_checksum: 'tampered-checksum' },
        nodes: repositoryNodes,
        edges: repositoryEdges,
      }),
    }),
  /Universe graph checksum mismatch/,
);

assert.throws(
  () =>
    new UniverseGraphRepository({
      load: () => ({
        provenance: { ...provenance, source: 'unknown' as never },
        nodes: [{ system_id: 1, security_status: 0.9 }],
        edges: [],
      }),
    }),
  /canonical SDE/,
);


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


const constrainedGraph = buildUniverseGraph({
  provenance,
  nodes: [
    { system_id: 101, security_status: 0.9 },
    { system_id: 102, security_status: 0.4 },
    { system_id: 103, security_status: 0.9 },
    { system_id: 104, security_status: 0.9 },
    { system_id: 105, security_status: 0.9 },
    { system_id: 106, security_status: 0.9 },
    { system_id: 107, security_status: 0.9 },
  ],
  edges: [
    { from_system_id: 101, to_system_id: 102 },
    { from_system_id: 102, to_system_id: 101 },
    { from_system_id: 102, to_system_id: 103 },
    { from_system_id: 103, to_system_id: 102 },
    { from_system_id: 103, to_system_id: 104 },
    { from_system_id: 104, to_system_id: 103 },
    { from_system_id: 101, to_system_id: 105 },
    { from_system_id: 105, to_system_id: 101 },
    { from_system_id: 105, to_system_id: 106 },
    { from_system_id: 106, to_system_id: 105 },
    { from_system_id: 106, to_system_id: 107 },
    { from_system_id: 107, to_system_id: 106 },
    { from_system_id: 107, to_system_id: 104 },
    { from_system_id: 104, to_system_id: 107 },
  ],
});

const constrainedEngine = new RouteEngine(constrainedGraph);
const unrestricted = constrainedEngine.findRoute(101, 104);
assert.equal(unrestricted.status, 'FOUND');
assert.equal(unrestricted.jumps, 3);
assert.deepEqual(unrestricted.systems, [101, 102, 103, 104]);
assert.equal(unrestricted.safety, 'NON_SAFE');

const shortestSafe = constrainedEngine.findSafeRoute(101, 104);
assert.equal(shortestSafe.status, 'FOUND');
assert.equal(shortestSafe.jumps, 4);
assert.deepEqual(shortestSafe.systems, [101, 105, 106, 107, 104]);
assert.equal(shortestSafe.safety, 'SAFE');
assert.equal(certifyRoute(constrainedGraph, shortestSafe, { requireSafe: true }).status, 'CERTIFIED');

const safeIndex = new RouteIndex(constrainedGraph, 104, 'SAFE');
assert.equal(safeIndex.getDistance(101), 4);
assert.equal(safeIndex.getRouteFrom(101).jumps, 4);
assert.equal(safeIndex.getRouteFrom(101).safety, 'SAFE');
assert.equal(safeIndex.getDistance(105), 3);
assert.equal(safeIndex.build_count, 1);
assert.equal(safeIndex.getDistance(101), 4);
assert.equal(safeIndex.getDistance(106), 2);
assert.equal(safeIndex.getDistance(107), 1);
assert.equal(safeIndex.build_count, 1);

const shortestIndex = new RouteIndex(constrainedGraph, 104, 'SHORTEST');
assert.equal(shortestIndex.getDistance(101), 3);
assert.equal(shortestIndex.getDistance(102), 2);
assert.equal(shortestIndex.getDistance(103), 1);
assert.equal(shortestIndex.getDistance(102), 2);
assert.equal(shortestIndex.build_count, 1);

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
  edges: [{ from_system_id: 10, to_system_id: 20 }],
});
const unknown = new RouteEngine(partialGraph).findRoute(10, 20);
assert.equal(unknown.status, 'UNKNOWN');
assert.equal(unknown.jumps, null);
assert.equal(certifyRoute(partialGraph, unknown).status, 'REJECTED');

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

const tamperedProvenance = {
  ...multiHop,
  graph_provenance: { ...multiHop.graph_provenance, graph_checksum: 'tampered' },
};
assert.equal(certifyRoute(graph, tamperedProvenance).status, 'REJECTED');

assert.throws(
  () =>
    buildUniverseGraph({
      provenance,
      nodes: [
        { system_id: 1, security_status: 0.9 },
        { system_id: 1, security_status: 0.8 },
      ],
      edges: [],
    }),
  /Duplicate universe graph node/,
);

assert.throws(
  () =>
    buildUniverseGraph({
      provenance,
      nodes: [{ system_id: 1, security_status: 0.9 }],
      edges: [{ from_system_id: 1, to_system_id: 2 }],
    }),
  /unknown system/,
);

const deterministicA = engine.findRoute(1, 4);
const deterministicB = engine.findRoute(1, 4);
assert.deepEqual(deterministicA, deterministicB);

console.log('route_engine.test.ts: OK');
