const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_HASH = new Uint32Array([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);

function rightRotate(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Utf8(input: string): string {
  const message = new TextEncoder().encode(input);
  const bitLength = message.length * 8;
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  const lengthOffset = paddedLength - 8;
  padded[lengthOffset] = (highBits >>> 24) & 0xff;
  padded[lengthOffset + 1] = (highBits >>> 16) & 0xff;
  padded[lengthOffset + 2] = (highBits >>> 8) & 0xff;
  padded[lengthOffset + 3] = highBits & 0xff;
  padded[lengthOffset + 4] = (lowBits >>> 24) & 0xff;
  padded[lengthOffset + 5] = (lowBits >>> 16) & 0xff;
  padded[lengthOffset + 6] = (lowBits >>> 8) & 0xff;
  padded[lengthOffset + 7] = lowBits & 0xff;

  const hash = new Uint32Array(INITIAL_HASH);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const base = offset + i * 4;
      schedule[i] =
        ((padded[base] << 24) |
          (padded[base + 1] << 16) |
          (padded[base + 2] << 8) |
          padded[base + 3]) >>>
        0;
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 = rightRotate(schedule[i - 15], 7) ^ rightRotate(schedule[i - 15], 18) ^ (schedule[i - 15] >>> 3);
      const s1 = rightRotate(schedule[i - 2], 17) ^ rightRotate(schedule[i - 2], 19) ^ (schedule[i - 2] >>> 10);
      schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let i = 0; i < 64; i += 1) {
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + SHA256_K[i] + schedule[i]) >>> 0;
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('');
}

export function canonicalizeUniverseGraphPayload(
  nodes: readonly { readonly system_id: number; readonly security_status: number | null }[],
  edges: readonly { readonly from_system_id: number; readonly to_system_id: number }[],
): { nodes: { system_id: number; security_status: number | null }[]; edges: { from_system_id: number; to_system_id: number }[] } {
  const canonicalNodes = [...nodes]
    .map((node) => ({ system_id: node.system_id, security_status: node.security_status }))
    .sort((a, b) => a.system_id - b.system_id);

  const edgeKeys = new Set<string>();
  const canonicalEdges: { from_system_id: number; to_system_id: number }[] = [];
  for (const edge of edges) {
    const key = `${edge.from_system_id}:${edge.to_system_id}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    canonicalEdges.push({ from_system_id: edge.from_system_id, to_system_id: edge.to_system_id });
  }

  canonicalEdges.sort(
    (a, b) => a.from_system_id - b.from_system_id || a.to_system_id - b.to_system_id,
  );

  return { nodes: canonicalNodes, edges: canonicalEdges };
}

export function calculateUniverseGraphChecksum(
  nodes: readonly { readonly system_id: number; readonly security_status: number | null }[],
  edges: readonly { readonly from_system_id: number; readonly to_system_id: number }[],
): string {
  return sha256Utf8(JSON.stringify(canonicalizeUniverseGraphPayload(nodes, edges)));
}
