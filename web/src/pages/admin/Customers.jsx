import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money, relativeDay } from '../../lib/format.js';
import { IconSearch } from '../../components/Icons.jsx';

export const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '50' });
      if (search.trim()) query.set('q', search.trim());
      const data = await api.get(`/admin/customers?${query}`);
      setCustomers(data.customers);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  return (
    <>
      <div className="searchbar" style={{ marginTop: 0, marginBottom: 14 }}>
        <span className="searchbar__icon"><IconSearch size={17} /></span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or phone number"
          aria-label="Search customers"
        />
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 220 }} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Orders</th>
                <th>Spend</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {customer.name}
                      {customer.role === 'admin' && <span className="badge badge--info" style={{ marginLeft: 6 }}>staff</span>}
                    </div>
                    <div className="tiny muted">{customer.phone}</div>
                  </td>
                  <td>{customer.orderCount}</td>
                  <td>{money(customer.spendPaise)}</td>
                  <td className="tiny muted">{relativeDay(customer.joinedAt)}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="center muted" style={{ padding: 24 }}>
                    No customers match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
