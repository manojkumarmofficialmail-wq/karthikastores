const rupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const preciseFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

/** Whole rupees when the paise are zero, two decimals otherwise. */
export const money = (paise = 0) =>
  paise % 100 === 0 ? rupeeFormatter.format(paise / 100) : preciseFormatter.format(paise / 100);

export const rupees = (paise = 0) => Math.round(paise / 100);

export const eta = (minutes) => {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
};

export const distance = (km) => (km == null ? null : `${km.toFixed(1)} km`);

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export const dateTime = (value) => (value ? dateFormat.format(new Date(value)) : '');

export const timeRange = (start, end) => {
  if (!start) return null;
  const opts = { hour: 'numeric', minute: '2-digit' };
  const from = new Date(start);
  const label = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(from);
  const time = new Intl.DateTimeFormat('en-IN', opts).format(from);
  if (!end) return `${label}, ${time}`;
  return `${label}, ${time} – ${new Intl.DateTimeFormat('en-IN', opts).format(new Date(end))}`;
};

export const relativeDay = (value) => {
  const date = new Date(value);
  const today = new Date();
  const diffDays = Math.round((today.setHours(0, 0, 0, 0) - new Date(value).setHours(0, 0, 0, 0)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
};

export const ORDER_STATUS = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'warn', step: 0 },
  confirmed: { label: 'Order confirmed', tone: 'info', step: 1 },
  preparing: { label: 'Being packed', tone: 'info', step: 2 },
  ready_for_pickup: { label: 'Ready for pickup', tone: 'good', step: 3 },
  out_for_delivery: { label: 'Out for delivery', tone: 'good', step: 3 },
  delivered: { label: 'Delivered', tone: 'good', step: 4 },
  cancelled: { label: 'Cancelled', tone: 'bad', step: -1 },
};

export const PAYMENT_LABELS = {
  upi_qr: 'UPI',
  razorpay: 'Card / netbanking',
  pay_on_delivery: 'Pay on delivery',
  pay_at_store: 'Pay at store',
};

/**
 * Payment states, in the customer's words. 'submitted' is the one worth
 * spelling out: the customer has paid as far as they are concerned, and what
 * they are waiting on is a person at the shop, not a machine.
 */
export const PAYMENT_STATUS = {
  pending: { label: 'Not paid yet', tone: 'warn' },
  submitted: { label: 'Checking with the shop', tone: 'info' },
  paid: { label: 'Paid', tone: 'good' },
  failed: { label: 'Payment failed', tone: 'bad' },
  refunded: { label: 'Refunded', tone: 'info' },
};

/** The same states as the counter sees them. */
export const PAYMENT_STATUS_STAFF = {
  pending: { label: 'Unpaid', tone: 'warn' },
  submitted: { label: 'Verify payment', tone: 'bad' },
  paid: { label: 'Paid', tone: 'good' },
  failed: { label: 'Failed', tone: 'bad' },
  refunded: { label: 'Refunded', tone: 'info' },
};
