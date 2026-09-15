import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { IconChart } from '../../components/Icons.jsx';

const dayLabel = (value) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(new Date(value));

export const AdminOverview = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/admin/overview').then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 90 }} />
        <div className="skeleton" style={{ height: 150 }} />
      </div>
    );
  }

  const peak = Math.max(...data.revenueByDay.map((day) => day.revenuePaise), 1);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="stat-grid">
        <div className="stat">
          <div className="stat__value">{data.totals.ordersToday}</div>
          <div className="stat__label">Orders today</div>
        </div>
        <div className="stat">
          <div className="stat__value">{money(data.totals.revenueTodayPaise)}</div>
          <div className="stat__label">Sales today</div>
        </div>
        <div className="stat">
          <div className="stat__value">{data.totals.openOrders}</div>
          <div className="stat__label">Open orders</div>
        </div>
        <div className="stat">
          <div className="stat__value">{money(data.totals.lifetimeRevenuePaise)}</div>
          <div className="stat__label">Delivered lifetime</div>
        </div>
      </section>

      <section className="card">
        <div className="section__head" style={{ marginBottom: 14 }}>
          <h2><IconChart size={16} /> Last 7 days</h2>
          <Link to="/admin/orders">All orders</Link>
        </div>
        <div className="bars">
          {data.revenueByDay.map((day, index) => (
            <div className="bars__col" key={day.day}>
              <div className="bars__track">
                <div
                  className={`bars__bar ${index === data.revenueByDay.length - 1 ? 'is-today' : ''}`}
                  style={{ height: `${Math.max((day.revenuePaise / peak) * 100, 3)}%` }}
                  title={`${money(day.revenuePaise)} from ${day.orders} order(s)`}
                />
              </div>
              <span className="bars__label">{dayLabel(day.day)}</span>
            </div>
          ))}
        </div>
      </section>

      {data.queue.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom: 12 }}>Needs attention</h2>
          <div className="row row--wrap" style={{ gap: 8 }}>
            {data.queue.map((item) => (
              <Link key={item.status} to={`/admin/orders?status=${item.status}`} className="chip">
                {item.label} · <strong>{item.count}</strong>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="section__head" style={{ marginBottom: 10 }}>
          <h2>Running low</h2>
          <Link to="/admin/inventory">Manage stock</Link>
        </div>
        {data.lowStock.length === 0 ? (
          <p className="small muted">Every shelf is comfortably stocked.</p>
        ) : (
          <div className="list">
            {data.lowStock.map((product) => (
              <div key={product.id} className="row row--between" style={{ padding: '8px 0' }}>
                <div className="grow">
                  <div className="small">{product.name}</div>
                  <div className="tiny muted">{product.unitLabel} · {product.category?.name}</div>
                </div>
                <span className={`badge ${product.stockQty === 0 ? 'badge--bad' : 'badge--warn'}`}>
                  {product.stockQty} left
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.topProducts.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Best sellers (30 days)</h2>
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="data" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Units</th>
                  <th>Sales</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.units}</td>
                    <td>{money(row.revenue_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
