import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { payForOrder } from '../lib/payments.js';
import {
  money,
  dateTime,
  timeRange,
  eta,
  ORDER_STATUS,
  PAYMENT_LABELS,
  PAYMENT_STATUS,
} from '../lib/format.js';
import { useCart } from '../store/cart.js';
import { useStoreInfo } from '../store/storeInfo.js';
import { useAuth } from '../store/auth.js';
import { toast } from '../store/ui.js';
import { PageBar } from '../components/TopBar.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { StatusTimeline } from '../components/StatusTimeline.jsx';
import { UpiPaySheet } from '../components/UpiPaySheet.jsx';
import { IconTruck, IconStore, IconPin, IconClock, IconQr } from '../components/Icons.jsx';

const LIVE_STATUSES = ['awaiting_payment', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'];

export const OrderDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const replaceCart = useCart((state) => state.replace);
  const { store } = useStoreInfo();

  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [simulator, setSimulator] = useState(null);
  const [simulatorResolve, setSimulatorResolve] = useState(null);
  const [upiOpen, setUpiOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/orders/${id}`);
      setOrder(data.order);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Light polling keeps the tracker honest while the order is in flight.
  useEffect(() => {
    if (!order || !LIVE_STATUSES.includes(order.status)) return undefined;
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [order, load]);

  if (error) {
    return (
      <>
        <PageBar title="Order" />
        <main className="page">
          <div className="banner banner--bad">{error}</div>
          <Link to="/orders" className="btn btn--outline btn--block" style={{ marginTop: 14 }}>
            Back to my orders
          </Link>
        </main>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <PageBar title="Order" />
        <main className="page stack">
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </main>
      </>
    );
  }

  const status = ORDER_STATUS[order.status];
  const paymentState = PAYMENT_STATUS[order.paymentStatus] ?? { label: order.paymentStatus, tone: 'warn' };
  const canCancel = ['awaiting_payment', 'confirmed', 'preparing'].includes(order.status);
  const unsettled =
    ['upi_qr', 'razorpay'].includes(order.paymentMethod) &&
    order.paymentStatus !== 'paid' &&
    order.paymentStatus !== 'refunded' &&
    order.status !== 'cancelled';
  // Waiting on a person at the shop, not on the customer.
  const awaitingShop = unsettled && order.paymentStatus === 'submitted';
  const needsPayment = unsettled && !awaitingShop;
  const lastPayment = order.payments?.[0];

  const askSimulated = (details) =>
    new Promise((resolve) => {
      setSimulatorResolve(() => resolve);
      setSimulator(details);
    });

  const answerSimulated = (outcome) => {
    setSimulator(null);
    simulatorResolve?.(outcome);
    setSimulatorResolve(null);
  };

  const retryPayment = async () => {
    setBusy(true);
    try {
      const paid = await payForOrder({
        orderId: order.id,
        customer: { name: user?.name, contact: user?.phone, email: user?.email ?? '' },
        confirmSimulated: askSimulated,
      });
      setOrder(paid);
      toast.success('Payment received — thank you!');
    } catch (err) {
      toast.error(err.message);
      load();
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (reason) => {
    setBusy(true);
    try {
      const data = await api.post(`/orders/${order.id}/cancel`, { reason });
      setOrder(data.order);
      setCancelOpen(false);
      toast.info('Order cancelled');
      // Say what actually happened to the money, rather than assuming.
      if (data.refund?.status === 'refunded') {
        toast.success('Refund raised — it reaches your account in 3–5 working days');
      } else if (data.refund?.status === 'manual') {
        toast.info('The shop will send your UPI payment back from the same account');
      } else if (data.refund?.status === 'failed') {
        toast.error('We could not raise the refund automatically. The shop has been notified.');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reorder = async () => {
    setBusy(true);
    try {
      const data = await api.post(`/orders/${order.id}/reorder`);
      replaceCart(data.cart);
      if (data.skipped?.length) toast.info(`${data.skipped.length} item(s) are unavailable now`);
      toast.success('Added back to your basket');
      navigate('/cart');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageBar title={order.orderNumber} />
      <main className="page">
        <section className="card section">
          <div className="row row--between">
            <div className="row" style={{ gap: 8 }}>
              {order.fulfilment === 'delivery' ? <IconTruck size={18} /> : <IconStore size={18} />}
              <strong>{order.fulfilment === 'delivery' ? 'Home delivery' : 'Store pickup'}</strong>
            </div>
            <span className={`badge badge--${status.tone}`}>{status.label}</span>
          </div>

          {LIVE_STATUSES.includes(order.status) && order.status !== 'awaiting_payment' && (
            <div className="banner" style={{ marginTop: 12 }}>
              <IconClock size={16} />
              <span>
                {order.slotStart
                  ? `Scheduled for ${timeRange(order.slotStart, order.slotEnd)}`
                  : `Expected in about ${eta(order.etaMinutes)}`}
              </span>
            </div>
          )}

          {needsPayment && (
            <div className="banner banner--warn" style={{ marginTop: 12 }}>
              <span aria-hidden="true">{order.paymentMethod === 'upi_qr' ? '📲' : '💳'}</span>
              <div className="grow small">
                {lastPayment?.errorDescription
                  ? `The shop could not find that payment — ${lastPayment.errorDescription}. Please try again.`
                  : 'Payment not completed. Your items are held until you pay.'}
              </div>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                disabled={busy}
                onClick={() => (order.paymentMethod === 'upi_qr' ? setUpiOpen(true) : retryPayment())}
              >
                {order.paymentMethod === 'upi_qr' ? 'Show QR' : 'Pay now'}
              </button>
            </div>
          )}

          {awaitingShop && (
            <div className="banner banner--info" style={{ marginTop: 12 }}>
              <IconQr size={16} />
              <div className="grow small">
                We have your reference{lastPayment?.upiReference ? ` (${lastPayment.upiReference})` : ''}.
                The shop is matching it against their bank alert — packing starts as soon as it clears.
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <StatusTimeline order={order} />
          </div>
        </section>

        <section className="card section">
          <h2 style={{ marginBottom: 10 }}>
            {order.fulfilment === 'delivery' ? 'Delivering to' : 'Collect from'}
          </h2>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <IconPin size={17} />
            <div className="small">
              {order.fulfilment === 'delivery' ? (
                <>
                  <div><strong>{order.contactName}</strong> · {order.contactPhone}</div>
                  <div className="muted">
                    {order.addressLine}
                    {order.landmark ? `, ${order.landmark}` : ''}, {order.city} {order.pincode}
                  </div>
                  {order.distanceKm != null && (
                    <div className="tiny faint">{order.distanceKm} km from the shop</div>
                  )}
                </>
              ) : (
                <>
                  <div><strong>{store?.name ?? 'Karthika Stores'}</strong></div>
                  <div className="muted">{store?.addressLine}, {store?.city} {store?.pincode}</div>
                  <div className="tiny faint">Show order {order.orderNumber} at the counter</div>
                </>
              )}
            </div>
          </div>
          {order.customerNote && (
            <div className="pill-note" style={{ marginTop: 12 }}>“{order.customerNote}”</div>
          )}
        </section>

        <section className="card section">
          <h2 style={{ marginBottom: 8 }}>{order.items.length} item{order.items.length > 1 ? 's' : ''}</h2>
          <div className="list">
            {order.items.map((item) => (
              <div key={item.id} className="row row--between" style={{ padding: '9px 0' }}>
                <div className="grow">
                  <div className="small">{item.name}</div>
                  <div className="tiny muted">{item.unitLabel} × {item.quantity}</div>
                </div>
                <strong className="small">{money(item.lineTotalPaise)}</strong>
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="bill">
            <div className="bill__row">
              <span className="muted">Item total</span>
              <span>{money(order.subtotalPaise + order.savingsPaise)}</span>
            </div>
            {order.savingsPaise > 0 && (
              <div className="bill__row bill__row--save">
                <span>Shop discount</span>
                <span>− {money(order.savingsPaise)}</span>
              </div>
            )}
            <div className="bill__row">
              <span className="muted">Delivery</span>
              <span>{order.deliveryFeePaise ? money(order.deliveryFeePaise) : 'FREE'}</span>
            </div>
            <div className="bill__row bill__row--total">
              <span>
                {order.paymentStatus === 'paid'
                  ? 'Paid'
                  : order.paymentStatus === 'refunded'
                    ? 'Refunded'
                    : 'To pay'}
              </span>
              <span>{money(order.totalPaise)}</span>
            </div>
          </div>

          <div className="row row--between" style={{ marginTop: 12 }}>
            <span className="tiny muted">{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
            <span className={`badge badge--${paymentState.tone}`}>{paymentState.label}</span>
          </div>
          {order.paymentMethod === 'upi_qr' && lastPayment?.upiReference && (
            <div className="tiny faint" style={{ marginTop: 4 }}>
              UPI reference {lastPayment.upiReference}
            </div>
          )}
          {order.status === 'cancelled' && order.paymentStatus === 'paid' && (
            <div className="banner banner--warn" style={{ marginTop: 10 }}>
              <span aria-hidden="true">⏳</span>
              <span className="small">
                Your refund is being sorted out by the shop — please call if you do not see it.
              </span>
            </div>
          )}
          <div className="tiny faint" style={{ marginTop: 6 }}>Placed {dateTime(order.placedAt)}</div>
        </section>

        <div className="stack">
          <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={reorder}>
            Order these again
          </button>
          {canCancel && (
            <button
              type="button"
              className="btn btn--danger btn--block"
              disabled={busy}
              onClick={() => setCancelOpen(true)}
            >
              Cancel this order
            </button>
          )}
          {store?.phone && (
            <a className="btn btn--ghost btn--block" href={`tel:${store.phone}`}>
              Call the shop
            </a>
          )}
        </div>
      </main>

      <UpiPaySheet
        open={upiOpen}
        order={order}
        onClose={() => {
          setUpiOpen(false);
          load();
        }}
        onClaimed={(updated) => {
          setUpiOpen(false);
          setOrder(updated);
        }}
      />

      <Sheet open={cancelOpen} title="Cancel this order?" onClose={() => setCancelOpen(false)}>
        <p className="small muted" style={{ marginBottom: 14 }}>
          The items go back on the shelf straight away.
          {order.paymentStatus !== 'paid'
            ? ''
            : order.paymentMethod === 'upi_qr'
              ? ' You paid by UPI, so the shop sends the money back to the same UPI ID by hand — give them a ring if it has not arrived by tomorrow.'
              : order.paymentMethod === 'razorpay'
                ? ' Your payment is refunded to the account you paid from, usually within 3–5 working days.'
                : ''}
        </p>
        <div className="stack" style={{ gap: 10 }}>
          {['Ordered by mistake', 'Taking too long', 'Found it elsewhere', 'Changed my mind'].map((reason) => (
            <button
              key={reason}
              type="button"
              className="btn btn--outline"
              disabled={busy}
              onClick={() => cancelOrder(reason)}
            >
              {reason}
            </button>
          ))}
          <button type="button" className="btn btn--ghost" onClick={() => setCancelOpen(false)}>
            Keep my order
          </button>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(simulator)}
        title="Payment (development gateway)"
        onClose={() => answerSimulated('cancel')}
      >
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row row--between">
            <span className="muted">Order</span>
            <strong>{simulator?.orderNumber}</strong>
          </div>
          <div className="row row--between" style={{ marginTop: 6 }}>
            <span className="muted">Amount</span>
            <strong>{money(simulator?.amountPaise ?? 0)}</strong>
          </div>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <button type="button" className="btn btn--primary" onClick={() => answerSimulated('success')}>
            Approve payment
          </button>
          <button type="button" className="btn btn--danger" onClick={() => answerSimulated('failure')}>
            Decline payment
          </button>
        </div>
      </Sheet>
    </>
  );
};
