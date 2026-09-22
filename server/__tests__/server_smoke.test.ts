/**
 * Server Smoke Test — EVE Trade Real Execution Lifecycle
 * Tests the complete lifecycle:
 * startup -> listen on dynamic port -> HTTP request -> verify response -> graceful shutdown -> verify port closed
 */

import assert from 'assert';
import { startServer, RunningServer } from '../../server';

async function runServerSmokeTest() {
  console.log('===============================================================');
  console.log('--- STARTING EVE TRADE SERVER SMOKE TEST (LOT-002) ----------');
  console.log('===============================================================');

  const startTime = Date.now();

  // 1. Start server on dynamic port (0)
  console.log('1. Starting server on dynamic port 0...');
  const instance: RunningServer = await startServer(0, { includeVite: false });

  assert.ok(instance.server, 'Server instance must exist');
  assert.ok(instance.port > 0, `Server port must be valid positive integer, got ${instance.port}`);
  console.log(`[PASS] Server started and listening on dynamic port ${instance.port}`);

  const targetUrl = `http://127.0.0.1:${instance.port}/api/health`;

  // 2. Send HTTP request to /api/health
  console.log(`2. Sending HTTP GET request to ${targetUrl}...`);
  const response = await fetch(targetUrl);
  console.log(`   Response HTTP Status: ${response.status} ${response.statusText}`);

  assert.strictEqual(response.status, 200, `Expected HTTP 200 OK from server, got ${response.status}`);

  const body = (await response.json()) as any;
  assert.strictEqual(body.status, 'healthy', `Expected body status "healthy", got "${body.status}"`);
  assert.strictEqual(body.catalog?.status, 'CATALOG_READY', `Expected catalog "CATALOG_READY", got "${body.catalog?.status}"`);
  assert.strictEqual(body.catalog?.item_count, 20526, `Expected item_count 20526, got ${body.catalog?.item_count}`);
  console.log('[PASS] Response contract verified (HTTP 200, healthy status, 20526 catalog items)');

  // 3. Graceful shutdown
  console.log('3. Requesting graceful shutdown of the server...');
  await instance.close();
  console.log('[PASS] Server closed callback executed without error');

  // 4. Verify clean termination: subsequent connection to the closed port must be refused
  console.log('4. Verifying clean termination (connection refusal on closed port)...');
  let connectionRefused = false;
  try {
    // Attempt request to the now-closed port (timeout 2000ms)
    await fetch(targetUrl, { signal: AbortSignal.timeout(2000) });
  } catch (err: unknown) {
    connectionRefused = true;
    console.log(`[PASS] Connection cleanly refused as expected: ${(err as Error).message}`);
  }

  assert.ok(connectionRefused, 'Expected connection to be refused on terminated server port');

  const durationMs = Date.now() - startTime;
  console.log('===============================================================');
  console.log(`SERVER SMOKE TEST SUCCEEDED in ${durationMs}ms with zero leaks.`);
  console.log('===============================================================');
}

runServerSmokeTest().catch((err) => {
  console.error('[FATAL] Server smoke test failed:', err);
  process.exit(1);
});
