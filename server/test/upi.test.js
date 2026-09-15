import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpiUri,
  formatUpiAmount,
  isValidReference,
  isValidVpa,
  storeAcceptsUpi,
  transactionRef,
  upiQrSvg,
} from '../src/lib/upi.js';

test('a valid UPI ID is accepted and a malformed one is not', () => {
  assert.ok(isValidVpa('karthikastores@okicici'));
  assert.ok(isValidVpa('9876500001@ybl'));
  assert.ok(isValidVpa('shop.name-1_2@okhdfcbank'));

  assert.ok(!isValidVpa('karthikastores'), 'no handle');
  assert.ok(!isValidVpa('@okicici'), 'no user part');
  assert.ok(!isValidVpa('shop@'), 'no bank');
  assert.ok(!isValidVpa('shop@@okicici'), 'two separators');
  assert.ok(!isValidVpa('sh op@okicici'), 'space in the user part');
  assert.ok(!isValidVpa('shop@1bank'), 'handle must start with a letter');
});

test('the amount always carries two decimals', () => {
  // Some PSPs drop the paise from a bare integer and others reject it, so
  // the long form is the only safe one.
  assert.equal(formatUpiAmount(25000), '250.00');
  assert.equal(formatUpiAmount(25050), '250.50');
  assert.equal(formatUpiAmount(5), '0.05');
  assert.equal(formatUpiAmount(0), '0.00');
});

test('the intent URI carries the payee, the exact amount and the currency', () => {
  const uri = buildUpiUri({
    vpa: 'karthikastores@okicici',
    payeeName: 'Karthika Stores',
    amountPaise: 48750,
    reference: 'KS2609151042A1',
    note: 'Order KS-260915-1042',
  });

  const params = new URLSearchParams(uri.slice('upi://pay?'.length));
  assert.ok(uri.startsWith('upi://pay?'));
  assert.equal(params.get('pa'), 'karthikastores@okicici');
  assert.equal(params.get('pn'), 'Karthika Stores');
  assert.equal(params.get('am'), '487.50');
  assert.equal(params.get('cu'), 'INR');
  assert.equal(params.get('tr'), 'KS2609151042A1');
  // A space must survive as %20: '+' shows up verbatim in some UPI apps.
  assert.ok(!uri.includes('+'));
});

test('a payee name with a query character cannot truncate the amount', () => {
  const uri = buildUpiUri({
    vpa: 'shop@okicici',
    payeeName: 'Raju & Sons #1',
    amountPaise: 10000,
  });
  const params = new URLSearchParams(uri.slice('upi://pay?'.length));
  assert.equal(params.get('pn'), 'Raju & Sons #1');
  assert.equal(params.get('am'), '100.00');
});

test('building a URI for an invalid VPA fails loudly', () => {
  assert.throws(() => buildUpiUri({ vpa: 'not-a-vpa', amountPaise: 100 }), /not a valid UPI ID/);
});

test('the transaction reference is alphanumeric and attempt-scoped', () => {
  const first = transactionRef('KS-260915-1042', 1);
  const second = transactionRef('KS-260915-1042', 2);
  assert.match(first, /^[0-9A-Z]+$/);
  assert.notEqual(first, second, 'a retry must not reuse the reference');
  assert.ok(first.length <= 35);
});

test('a UTR is accepted in the shape UPI apps show it', () => {
  assert.ok(isValidReference('412345678901'), '12 digit UTR');
  assert.ok(isValidReference('AXIS0012345'), 'alphanumeric reference');
  assert.ok(!isValidReference('12345'), 'too short');
  assert.ok(!isValidReference('4123 4567 8901'), 'spaces');
  assert.ok(!isValidReference('412345678901234567890123'), 'too long');
});

test('the shop only accepts UPI when it is switched on and the VPA parses', () => {
  assert.ok(storeAcceptsUpi({ accepts_upi_qr: true, upi_vpa: 'shop@okicici' }));
  assert.ok(!storeAcceptsUpi({ accepts_upi_qr: false, upi_vpa: 'shop@okicici' }), 'switched off');
  assert.ok(!storeAcceptsUpi({ accepts_upi_qr: true, upi_vpa: '' }), 'no VPA set');
  assert.ok(!storeAcceptsUpi({ accepts_upi_qr: true, upi_vpa: 'typo-at-bank' }), 'bad VPA');
  assert.ok(!storeAcceptsUpi(null));
});

test('the QR encodes the intent as standalone SVG', async () => {
  const uri = buildUpiUri({ vpa: 'shop@okicici', payeeName: 'Shop', amountPaise: 12300 });
  const svg = await upiQrSvg(uri);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('viewBox'), 'scales to whatever box the phone gives it');
  assert.ok(!svg.includes('<script'));
});
