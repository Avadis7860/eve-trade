import assert from 'node:assert/strict';
import { classifyPaths } from '../ci-scope.mjs';

function expectScope(paths, expected) {
  const actual = classifyPaths(paths);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(actual[key], value, `scope ${JSON.stringify(paths)}: ${key}`);
  }
}

expectScope([], {
  ambiguous: true, full_certification: true,
  run_static: true, run_unit_domain: true, run_server: true, run_build: true, run_browser: true,
});

expectScope(['docs/validation/ci.md', 'README.md'], {
  docs: true, ambiguous: false, full_certification: false,
  run_static: false, run_unit_domain: false, run_server: false, run_build: false, run_browser: false,
});

expectScope(['docs/contracts/orders.md'], {
  docs: true, ambiguous: true, full_certification: true,
  run_static: true, run_unit_domain: true, run_server: true, run_build: true, run_browser: true,
});

expectScope(['.eve-trade/context-map.json'], {
  ambiguous: true, full_certification: true,
  run_static: true, run_unit_domain: true, run_server: true, run_build: true, run_browser: true,
});

expectScope(['src/components/Trading.tsx'], {
  frontend: true, ambiguous: false, full_certification: false,
  run_static: true, run_unit_domain: false, run_server: false, run_build: true, run_browser: true,
});

expectScope(['src/services/foo.ts'], {
  server: true, ambiguous: false, full_certification: true,
  run_static: true, run_unit_domain: true, run_server: true, run_build: true, run_browser: true,
});

expectScope(['scripts/universe-graph-builder.mjs'], {
  sde: true, ambiguous: false, full_certification: true,
});

expectScope(['some/new/unknown.file'], {
  ambiguous: true, full_certification: true,
  run_static: true, run_unit_domain: true, run_server: true, run_build: true, run_browser: true,
});

console.log('CI scope classification tests passed.');
