/**
 * UPI QR payments.
 *
 * There is no gateway here and no API key: the QR encodes a standard UPI
 * intent URI (NPCI's deep-link spec) pointing at the shop's own VPA, so the
 * money moves bank-to-bank between the customer's UPI app and the shop's
 * account. Nothing sensitive passes through this server — a VPA is public
 * information, the same handle printed on the QR sticker at the counter.
 *
 * The trade-off that shapes everything below: without a gateway there is no
 * callback, so the server cannot *know* a payment happened. It can only record
 * that the customer says it did (a UTR) and wait for a human at the shop to
 * match it against the bank alert. That is why `payment_status` has a
 * 'submitted' state between 'pending' and 'paid', and why nothing but a staff
 * confirmation ever writes 'paid'.
 */
import QRCode from 'qrcode';

/** How long a generated QR is offered before the customer is asked to refresh. */
export const INTENT_TTL_MINUTES = 15;

/**
 * user@bank. Deliberately permissive on the handle (banks keep inventing new
 * ones) and strict on shape, so a typo in the admin screen is caught at save
 * time rather than by a customer staring at a QR that goes nowhere.
 */
export const VPA_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,63})@[a-zA-Z][a-zA-Z0-9.-]{1,31}$/;

export const isValidVpa = (value) => typeof value === 'string' && VPA_PATTERN.test(value.trim());

/** UTR / reference number as shown in the customer's UPI app. */
export const REFERENCE_PATTERN = /^[0-9A-Za-z]{6,22}$/;

export const isValidReference = (value) =>
  typeof value === 'string' && REFERENCE_PATTERN.test(value.trim());

/**
 * Rupees with exactly two decimals. UPI apps reject `am=250` from some PSPs
 * and silently drop the paise from others, so the amount is always formatted
 * the long way from the integer paise we hold.
 */
export const formatUpiAmount = (amountPaise) => (Math.round(amountPaise) / 100).toFixed(2);

/**
 * Transaction reference. Most PSPs accept only alphanumerics here and cap the
 * length, so the order number's hyphens are stripped rather than passed on.
 */
export const transactionRef = (orderNumber, attempt = 1) =>
  `${String(orderNumber).replace(/[^0-9A-Za-z]/g, '')}A${attempt}`.slice(0, 35).toUpperCase();

/**
 * Build the `upi://pay?…` intent URI. Every value is encoded: a payee name
 * with a space or an ampersand would otherwise truncate the query string and
 * produce a QR that pays the wrong amount to the right person.
 */
export const buildUpiUri = ({ vpa, payeeName, amountPaise, reference, note }) => {
  if (!isValidVpa(vpa)) {
    throw new Error(`"${vpa}" is not a valid UPI ID`);
  }
  const params = new URLSearchParams();
  params.set('pa', vpa.trim());
  params.set('pn', (payeeName || 'Merchant').trim().slice(0, 50));
  params.set('am', formatUpiAmount(amountPaise));
  params.set('cu', 'INR');
  if (reference) params.set('tr', reference);
  if (note) params.set('tn', note.slice(0, 50));
  // URLSearchParams encodes a space as '+', which some UPI apps show verbatim
  // in the note. %20 is understood everywhere.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
};

/**
 * The QR itself, as inline SVG. Rendering server-side keeps the web bundle
 * free of a QR library and gives the customer app and the shop dashboard the
 * identical image. Error correction M survives a thumbprint on a phone screen
 * without inflating the module count.
 */
export const upiQrSvg = (uri) =>
  QRCode.toString(uri, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#14201a', light: '#ffffff' },
  });

/** Everything a client needs to render a payment screen. */
export const buildUpiIntent = async ({ vpa, payeeName, amountPaise, reference, note }) => {
  const uri = buildUpiUri({ vpa, payeeName, amountPaise, reference, note });
  return {
    reference,
    upiUri: uri,
    qrSvg: await upiQrSvg(uri),
    amountPaise,
    payeeVpa: vpa.trim(),
    payeeName,
  };
};

/** Is the shop set up to take UPI at all? */
export const storeAcceptsUpi = (store) =>
  Boolean(store?.accepts_upi_qr) && isValidVpa(store?.upi_vpa ?? '');
