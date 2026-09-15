import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth.js';
import { AdminOverview } from './Overview.jsx';
import { AdminOrders } from './Orders.jsx';
import { AdminInventory } from './Inventory.jsx';
import { AdminCustomers } from './Customers.jsx';
import { AdminSettings } from './Settings.jsx';
import { IconLogout } from '../../components/Icons.jsx';

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'orders', label: 'Orders' },
  { to: 'inventory', label: 'Inventory' },
  { to: 'customers', label: 'Customers' },
  { to: 'settings', label: 'Settings' },
];

export const AdminPage = () => {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner row row--between">
          <div className="topbar__title">
            <span className="topbar__mark" aria-hidden="true">🧾</span>
            <div>
              <div className="topbar__name">Shop dashboard</div>
              <div className="topbar__meta">Signed in as {user?.name}</div>
            </div>
          </div>
          <button
            type="button"
            className="topbar__action"
            onClick={() => logout().then(() => navigate('/'))}
          >
            <IconLogout size={15} /> Sign out
          </button>
        </div>
      </header>

      <main className="page">
        <nav className="admin-tabs" aria-label="Dashboard sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.label}
              to={tab.to ? `/admin/${tab.to}` : '/admin'}
              end={tab.end}
              className={({ isActive }) => `chip ${isActive ? 'is-active' : ''}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <Routes>
          <Route index element={<AdminOverview />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </>
  );
};
