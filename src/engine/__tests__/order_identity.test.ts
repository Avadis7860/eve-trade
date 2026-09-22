import { compareOrderIds, normalizeOrderId } from '../orderIdentity';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('[OrderIdentityTest] ' + message);
}

function run(): void {
  const maxSafe = String(Number.MAX_SAFE_INTEGER);

  assert(normalizeOrderId(123) === '123', 'Safe numeric order IDs must canonicalize to strings');
  assert(normalizeOrderId('000123') === '123', 'String order IDs must normalize leading zeroes');
  assert(normalizeOrderId(maxSafe) === maxSafe, 'MAX_SAFE_INTEGER must remain exact');
  assert(normalizeOrderId(Number.MAX_SAFE_INTEGER) === maxSafe, 'MAX_SAFE_INTEGER number must remain exact');

  assert(normalizeOrderId(0) === null, 'Zero order ID must fail');
  assert(normalizeOrderId(-1) === null, 'Negative numeric order ID must fail');
  assert(normalizeOrderId('0') === null, 'Zero string order ID must fail');
  assert(normalizeOrderId('-1') === null, 'Negative string order ID must fail');
  assert(normalizeOrderId('12.5') === null, 'Decimal string order ID must fail');
  assert(normalizeOrderId('abc') === null, 'Non-numeric string order ID must fail');
  assert(normalizeOrderId(Number.MAX_SAFE_INTEGER + 1) === null, 'Unsafe numeric order ID must fail closed');
  assert(normalizeOrderId(1.5) === null, 'Fractional numeric order ID must fail');

  assert(compareOrderIds('2', '10') < 0, 'Order ID comparison must be numeric, not lexical');
  assert(compareOrderIds('10', '2') > 0, 'Reverse numeric order ID comparison must work');
  assert(compareOrderIds('9007199254740993', '9007199254740992') > 0, 'BigInt comparison must preserve large IDs');
  assert(compareOrderIds('42', '42') === 0, 'Equal order IDs must compare equal');

  console.log('✅ Canonical order identity contract verified.');
}

run();
