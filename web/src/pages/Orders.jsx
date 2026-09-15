import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { money, ORDER_STATUS, PAYMENT_LABELS, relativeDay, dateTime } from '../lib/format.js';
import { PageBar } from '../components/TopBar.jsx';
import { usePullToRefresh } from '../components/AppShell.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconTruck, IconStore, IconChevron } from '../components/Icons.jsx';

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
];

export const OrdersPage = () => {
  const [tab, setTab] = useState('active');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    () => api.get(`/orders?status=${tab}&limit=30`).then((data) => setOrders(data.orders)),
    [tab]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch(() => !cancelled && setOrders([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Somebody watching for "out for delivery" will pull this list. Give them
  // the gesture rather than making them navigate away and back.
  usePullToRefresh(load, [load]);

  return (
    <>
      <PageBar title="My orders" />
      <main className="page">
        <div className="scroller" style={{ marginBottom: 14 }}>
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`chip ${tab === item.value ? 'is-active' : ''}`}
              onClick={() => setTab(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="stack">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="skeleton" style={{ height: 96 }} />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            art="🧾"
            title={tab === 'active' ? 'No orders on the way' : 'No orders yet'}
            message="When you place an order it will show up here with live status."
            action={<Link className="btn btn--primary" to="/">Start shopping</Link>}
          />
        ) : (
          <div className="stack">
            {orders.map((order) => {
              const status = ORDER_STATUS[order.status];
              return (
                <Link key={order.id} to={`/orders/${order.id}`} className="card card--tap">
                  <div className="row row--between">
                    <div className="row" style={{ gap: 8 }}>
                      {order.fulfilment === 'delivery' ? <IconTruck size={17} /> : <IconStore size={17} />}
                      <strong className="small">{order.orderNumber}</strong>
                    </div>
                    <span className={`badge badge--${status.tone}`}>{status.label}</span>
                  </div>

                  <div className="row row--between" style={{ marginTop: 10 }}>
                    <div>
                      <div className="small">
                        {order.itemCount} item{order.itemCount > 1 ? 's' : ''} · {money(order.totalPaise)}
                      </div>
                      <div className="tiny muted">
                        {relativeDay(order.placedAt)}, {dateTime(order.placedAt).split(', ').pop()} ·{' '}
                        {PAYMENT_LABELS[order.paymentMethod]}
                        {order.paymentStatus === 'pending' && order.paymentMethod !== 'razorpay' ? ' (due)' : ''}
                      </div>
                    </div>
                    <IconChevron size={18} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
};
