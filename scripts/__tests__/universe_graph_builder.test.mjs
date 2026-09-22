import assert from 'node:assert/strict';
import { buildUniverseGraphFromSde } from '../universe-graph-builder.mjs';

const SCOPE_A = 30000142;
const SCOPE_B = 30002187;
const SCOPE_C = 30002659;
const SCOPE_D = 30002510;

function system(id, security, stargateIDs) {
  return JSON.stringify({ _key: id, securityStatus: security, stargateIDs });
}

function gate(id, from, to, destinationGateId) {
  return JSON.stringify({
    _key: id,
    solarSystemID: from,
    destination: {
      solarSystemID: to,
      stargateID: destinationGateId,
    },
  });
}

const systems = [
  system(SCOPE_A, 0.95, [50000001]),
  system(SCOPE_B, 0.90, [50000002, 50000003]),
  system(SCOPE_C, 0.75, [50000004, 50000005]),
  system(SCOPE_D, 0.55, [50000006]),
];

const gates = [
  gate(50000001, SCOPE_A, SCOPE_B, 50000002),
  gate(50000002, SCOPE_B, SCOPE_A, 50000001),
  gate(50000003, SCOPE_B, SCOPE_C, 50000004),
  gate(50000004, SCOPE_C, SCOPE_B, 50000003),
  gate(50000005, SCOPE_C, SCOPE_D, 50000006),
  gate(50000006, SCOPE_D, SCOPE_C, 50000005),
];

const validInput = {
  dataset_version: '3503375',
  mapSolarSystemsContent: systems.join('\n') + '\n',
  mapStargatesContent: gates.join('\n') + '\n',
};

const artifact = buildUniverseGraphFromSde(validInput);

assert.equal(artifact.schema_version, 1);
assert.equal(artifact.graph_version, 'sde-3503375');
assert.equal(artifact.provenance.source, 'sde_canonical');
assert.equal(artifact.provenance.completeness, 'complete');
assert.equal(artifact.provenance.route_scope, 'new_eden_known_space_v1');
assert.equal(artifact.provenance.generator_version, '2.7C.1');
assert.equal(artifact.nodes.length, 4);
assert.equal(artifact.edges.length, 6);
assert.deepEqual(
  artifact.nodes.map((node) => node.system_id),
  [SCOPE_A, SCOPE_B, SCOPE_D, SCOPE_C],
);
assert.deepEqual(
  artifact.edges,
  [
    { from_system_id: SCOPE_A, to_system_id: SCOPE_B },
    { from_system_id: SCOPE_B, to_system_id: SCOPE_A },
    { from_system_id: SCOPE_B, to_system_id: SCOPE_C },
    { from_system_id: SCOPE_D, to_system_id: SCOPE_C },
    { from_system_id: SCOPE_C, to_system_id: SCOPE_B },
    { from_system_id: SCOPE_C, to_system_id: SCOPE_D },
  ],
);

const reorderedArtifact = buildUniverseGraphFromSde({
  ...validInput,
  mapSolarSystemsContent: [...systems].reverse().join('\n') + '\n',
  mapStargatesContent: [...gates].reverse().join('\n') + '\n',
});
assert.equal(
  reorderedArtifact.provenance.graph_checksum,
  artifact.provenance.graph_checksum,
  'Canonical graph checksum must be independent of SDE row order',
);
assert.notEqual(
  reorderedArtifact.provenance.dataset_checksum,
  artifact.provenance.dataset_checksum,
  'Dataset checksum must authenticate the exact source bytes',
);

function expectFailure(name, mutate, expectedMessage) {
  assert.throws(
    () => buildUniverseGraphFromSde(mutate(validInput)),
    new RegExp(expectedMessage),
    name,
  );
}

expectFailure(
  'missing security status',
  (input) => ({ ...input, mapSolarSystemsContent: system(SCOPE_A, undefined, [50000001]) }),
  'Invalid canonical security status',
);

expectFailure(
  'invalid security status',
  (input) => ({ ...input, mapSolarSystemsContent: system(SCOPE_A, 1.5, [50000001]) }),
  'Invalid canonical security status',
);

expectFailure(
  'duplicate New Eden system',
  (input) => ({
    ...input,
    mapSolarSystemsContent: [...systems, systems[0]].join('\n'),
  }),
  'Duplicate New Eden system ID',
);

expectFailure(
  'missing system reference',
  (input) => ({
    ...input,
    mapStargatesContent: gate(50000001, SCOPE_A, 30009999, 50000099),
  }),
  'references a New Eden system absent from mapSolarSystems',
);

expectFailure(
  'scope boundary crossing',
  (input) => ({
    ...input,
    mapStargatesContent: gate(50000001, SCOPE_A, 31000000, 50000099),
  }),
  'crosses the New Eden graph boundary',
);

expectFailure(
  'self loop',
  (input) => ({
    ...input,
    mapSolarSystemsContent: system(SCOPE_A, 0.95, [50000001]),
    mapStargatesContent: gate(50000001, SCOPE_A, SCOPE_A, 50000001),
  }),
  'self-loop',
);

expectFailure(
  'duplicate stargate ID',
  (input) => ({
    ...input,
    mapStargatesContent: [
      gate(50000001, SCOPE_A, SCOPE_B, 50000002),
      gate(50000001, SCOPE_B, SCOPE_A, 50000001),
    ].join('\n'),
  }),
  'Duplicate stargate ID',
);

expectFailure(
  'duplicate canonical edge',
  (input) => ({
    ...input,
    mapSolarSystemsContent: [
      system(SCOPE_A, 0.95, [50000001, 50000007]),
      system(SCOPE_B, 0.9, [50000002]),
    ].join('\n'),
    mapStargatesContent: [
      gate(50000001, SCOPE_A, SCOPE_B, 50000002),
      gate(50000002, SCOPE_B, SCOPE_A, 50000001),
      gate(50000007, SCOPE_A, SCOPE_B, 50000002),
    ].join('\n'),
  }),
  'Duplicate canonical stargate edge',
);

expectFailure(
  'asymmetric topology',
  (input) => ({
    ...input,
    mapStargatesContent: gate(50000001, SCOPE_A, SCOPE_B, 50000002),
  }),
  'not symmetric',
);

expectFailure(
  'declared stargateIDs mismatch',
  (input) => ({
    ...input,
    mapSolarSystemsContent: systems.map((line, index) =>
      index === 0 ? system(SCOPE_A, 0.95, [99999999]) : line,
    ).join('\n'),
  }),
  'stargateIDs mismatch',
);

expectFailure(
  'missing reciprocal stargate record',
  (input) => ({
    ...input,
    mapStargatesContent: [
      gate(50000001, SCOPE_A, SCOPE_B, 50000002),
      gate(50000002, SCOPE_B, SCOPE_A, 59999999),
    ].join('\n'),
  }),
  'Invalid reciprocal stargate reference',
);

console.log('universe_graph_builder.test.mjs: OK');
