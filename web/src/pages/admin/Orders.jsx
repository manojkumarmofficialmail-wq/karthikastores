import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import {
  money,
  dateTime,
  ORDER_STATUS,
  PAYMENT_LABELS,
  PAYMENT_STATUS_STAFF,
  timeRange,
} from '../../lib/format.js';
import { toast } from '../../store/ui.js';
import { Sheet } from '../../components/Sheet.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { IconTruck, IconStore, IconSearch, IconQr, IconCheck } from '../../components/Icons.jsx';

const FILTERS = [
  { value: 'open', label: 'Open' },
  // Not a status but the queue that actually needs a human: customers who
  // have paid by UPI and are waiting for someone to check the bank alert.
  { value: 'to-verify', label: 'Verify payment', payment: 'submitted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Packing' },
  { value: 'ready_for_pickup', label: 'Ready' },
  { value: 'out_for_delivery', label: 'On the way' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

export const AdminOrders = () => {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filter = FILTERS.find((f) => f.value === status);
      const query = new URLSearchParams({
        status: filter?.payment ? 'all' : status,
        limit: '40',
      });
      if (filter?.payment) query.set('payment', filter.payment);
      if (search.trim()) query.set('q', search.trim());
      const data = await api.get(`/admin/orders?${query}`);
      setOrders(data.orders);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // The counter leaves this screen open all day; refresh it quietly.
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const openOrder = async (order) => {
    try {
      const data = await api.get(`/admin/orders/${order.id}`);
      setSelected(data.order);
      setNote('');
      setReference(data.order.payments?.[0]?.upiReference ?? '');
    } catch (error) {
      toast.error(error.message);
    }
  };

  /**
   * Settle a UPI payment by hand. This is the moment the shop takes
   * responsibility: nothing in the system knows the money arrived until
   * somebody here says it did, after looking at the bank alert.
   */
  const settlePayment = async (action) => {
    setBusy(true);
    try {
      const data = await api.post(`/admin/orders/${selected.id}/payment`, {
        action,
        ...(action === 'confirm' && reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setSelected(data.order);
      setNote('');
      toast.success(
        action === 'confirm' ? 'Payment confirmed — the order is live' : 'Marked as not received'
      );
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const advance = async (nextStatus) => {
    setBusy(true);
    try {
      const data = await api.patch(`/admin/orders/${selected.id}/status`, {
        status: nextStatus,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setSelected(data.order);
      setNote('');
      toast.success(`Marked ${ORDER_STATUS[nextStatus].label.toLowerCase()}`);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="searchbar" style={{ marginBottom: 12, marginTop: 0 }}>
        <span className="searchbar__icon"><IconSearch size={17} /></span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Order number, customer name or phone"
          aria-label="Search orders"
        />
      </div>

      <div className="scroller" style={{ marginBottom: 14 }}>
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`chip ${status === filter.value ? 'is-active' : ''}`}
            onClick={() => setParams(filter.value === 'open' ? {} : { status: filter.value })}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="stack">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="skeleton" style={{ height: 82 }} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState art="✅" title="Nothing here" message="No orders match this filter right now." />
      ) : (
        <div className="stack">
          {orders.map((order) => {
            const tone = ORDER_STATUS[order.status];
            return (
              <button key={order.id} type="button" className="card card--tap" onClick={() => openOrder(order)} style={{ textAlign: 'left' }}>
                <div className="row row--between">
                  <div className="row" style={{ gap: 8 }}>
                    {order.fulfilment === 'delivery' ? <IconTruck size={16} /> : <IconStore size={16} />}
                    <strong className="small">{order.orderNumber}</strong>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {order.paymentStatus === 'submitted' && (
                      <span className="badge badge--bad">
                        <IconQr size={11} /> Verify
                      </span>
                    )}
                    <span className={`badge badge--${tone.tone}`}>{tone.label}</span>
                  </div>
                </div>
                <div className="row row--between" style={{ marginTop: 8 }}>
                  <div className="small">
                    <div>{order.contactName} · {order.contactPhone}</div>
                    <div className="tiny muted">
                      {order.itemCount} items · {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
                      {order.distanceKm != null && ` · ${order.distanceKm} km`}
                    </div>
                  </div>
                  <strong>{money(order.totalPaise)}</strong>
                </div>
                <div className="tiny faint" style={{ marginTop: 6 }}>{dateTime(order.placedAt)}</div>
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={Boolean(selected)} title={selected?.orderNumber} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <div className="row row--between" style={{ marginBottom: 12 }}>
              <span className={`badge badge--${ORDER_STATUS[selected.status].tone}`}>
                {ORDER_STATUS[selected.status].label}
              </span>
              <span className="badge">
                {selected.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
              </span>
            </div>

            <div className="card" style={{ marginBottom: 12 }}>
              <div className="small"><strong>{selected.contactName}</strong> · {selected.contactPhone}</div>
              {selected.fulfilment === 'delivery' ? (
                <div className="small muted" style={{ marginTop: 4 }}>
                  {selected.addressLine}
                  {selected.landmark ? `, ${selected.landmark}` : ''}, {selected.city} {selected.pincode}
                  {selected.distanceKm != null && ` · ${selected.distanceKm} km away`}
                </div>
              ) : (
                <div className="small muted" style={{ marginTop: 4 }}>Collecting from the shop</div>
              )}
              {selected.slotStart && (
                <div className="tiny faint" style={{ marginTop: 4 }}>
                  Scheduled: {timeRange(selected.slotStart, selected.slotEnd)}
                </div>
              )}
              {selected.customerNote && (
                <div className="pill-note" style={{ marginTop: 10 }}>“{selected.customerNote}”</div>
              )}
              <a href={`tel:${selected.contactPhone}`} className="btn btn--outline btn--sm" style={{ marginTop: 10 }}>
                Call customer
              </a>
            </div>

            <h3 style={{ marginBottom: 6 }}>Picking list</h3>
            <div className="list" style={{ marginBottom: 12 }}>
              {selected.items.map((item) => (
                <div key={item.id} className="row row--between" style={{ padding: '7px 0' }}>
                  <div className="grow small">
                    {item.name} <span className="muted">· {item.unitLabel}</span>
                  </div>
                  <strong className="small" style={{ marginRight: 10 }}>× {item.quantity}</strong>
                  <span className="small muted">{money(item.lineTotalPaise)}</span>
                </div>
              ))}
            </div>

            {selected.paymentMethod === 'upi_qr' && selected.paymentStatus !== 'paid' &&
              selected.status !== 'cancelled' && (
                <div className="verify-card">
                  <div className="row row--between">
                    <strong className="small row" style={{ gap: 6 }}>
                      <IconQr size={15} /> UPI payment
                    </strong>
                    <strong>{money(selected.totalPaise)}</strong>
                  </div>
                  <p className="tiny muted" style={{ margin: '8px 0 10px' }}>
                    {selected.paymentStatus === 'submitted'
                      ? 'The customer says they have paid. Check the shop’s bank alert for this amount and reference before confirming.'
                      : 'No payment reported yet. Confirm only if you can see the money in the shop’s account.'}
                  </p>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="verify-ref">Reference (UTR)</label>
                    <input
                      id="verify-ref"
                      value={reference}
                      inputMode="numeric"
                      placeholder="From the customer or your bank alert"
                      onChange={(event) => setReference(event.target.value.replace(/\s/g, ''))}
                    />
                  </div>
                  <div className="row" style={{ gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn--primary grow"
                      disabled={busy}
                      onClick={() => settlePayment('confirm')}
                    >
                      <IconCheck size={15} /> Money received
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={busy || selected.paymentStatus !== 'submitted'}
                      onClick={() => settlePayment('reject')}
                    >
                      Not received
                    </button>
                  </div>
                </div>
              )}

            <div className="bill" style={{ marginBottom: 14 }}>
              <div className="bill__row">
                <span className="muted">{PAYMENT_LABELS[selected.paymentMethod] ?? selected.paymentMethod}</span>
                <span
                  className={`badge badge--${(PAYMENT_STATUS_STAFF[selected.paymentStatus] ?? {}).tone ?? 'warn'}`}
                >
                  {(PAYMENT_STATUS_STAFF[selected.paymentStatus] ?? {}).label ?? selected.paymentStatus}
                </span>
              </div>
              <div className="bill__row bill__row--total">
                <span>Total</span>
                <span>{money(selected.totalPaise)}</span>
              </div>
            </div>

            {selected.nextStatuses?.length > 0 ? (
              <>
                <div className="field">
                  <label htmlFor="status-note">Note (optional)</label>
                  <input
                    id="status-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. rider Anil is carrying it"
                  />
                </div>
                <div className="stack" style={{ gap: 10 }}>
                  {selected.nextStatuses.map((next) => (
                    <button
                      key={next}
                      type="button"
                      className={`btn ${next === 'cancelled' ? 'btn--danger' : 'btn--primary'}`}
                      disabled={busy}
                      onClick={() => advance(next)}
                    >
                      Mark {ORDER_STATUS[next].label.toLowerCase()}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="banner">
                <span aria-hidden="true">✅</span>
                <span className="small">This order is closed — nothing left to do.</span>
              </div>
            )}

            {selected.history?.length > 0 && (
              <>
                <h3 style={{ margin: '16px 0 6px' }}>History</h3>
                <div className="list">
                  {selected.history.map((entry, index) => (
                    <div key={index} className="row row--between" style={{ padding: '6px 0', gap: 10 }}>
                      <div className="grow">
                        <span className="small">{ORDER_STATUS[entry.status]?.label ?? entry.status}</span>
                        {entry.note && <div className="tiny muted">{entry.note}</div>}
                      </div>
                      <span className="tiny muted" style={{ flex: 'none' }}>{dateTime(entry.at)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Sheet>
    </>
  );
};
