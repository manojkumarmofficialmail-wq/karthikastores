import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { useStoreInfo } from '../store/storeInfo.js';
import { toast } from '../store/ui.js';
import { money } from '../lib/format.js';
import { PageBar } from '../components/TopBar.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { IconPin, IconOrders, IconLogout, IconChevron, IconShield, IconStore } from '../components/Icons.jsx';

export const AccountPage = () => {
  const user = useAuth((state) => state.user);
  const isAdmin = useAuth((state) => state.isAdmin);
  const logout = useAuth((state) => state.logout);
  const updateProfile = useAuth((state) => state.updateProfile);
  const savePreference = useAuth((state) => state.savePreference);
  const { store } = useStoreInfo();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ orders: 0, spend: 0 });
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/orders?status=all&limit=50')
      .then((data) => {
        const relevant = data.orders.filter((order) => order.status !== 'cancelled');
        setStats({
          orders: relevant.length,
          spend: relevant.reduce((sum, order) => sum + order.totalPaise, 0),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) setForm({ name: user.name, email: user.email ?? '' });
  }, [user]);

  const preferredFulfilment = user?.preferences?.fulfilment ?? 'delivery';

  return (
    <>
      <PageBar title="My account" />
      <main className="page">
        <section className="card section">
          <div className="row" style={{ gap: 12 }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: 16, background: 'var(--green-50)',
                display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700,
                color: 'var(--green-600)', flex: 'none',
              }}
            >
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="grow">
              <strong>{user?.name}</strong>
              <div className="small muted">{user?.phone}</div>
              {user?.email && <div className="tiny faint">{user.email}</div>}
            </div>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditOpen(true)}>
              Edit
            </button>
          </div>

          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <div className="grow card" style={{ padding: 10 }}>
              <div className="stat__value" style={{ fontSize: 18 }}>{stats.orders}</div>
              <div className="stat__label">Orders placed</div>
            </div>
            <div className="grow card" style={{ padding: 10 }}>
              <div className="stat__value" style={{ fontSize: 18 }}>{money(stats.spend)}</div>
              <div className="stat__label">Total spent</div>
            </div>
          </div>
        </section>

        <section className="card section" style={{ padding: '4px 14px' }}>
          <div className="list">
            <Link to="/account/addresses" className="list-item">
              <span className="list-item__art"><IconPin size={18} /></span>
              <span className="grow">
                <div className="small" style={{ fontWeight: 600 }}>Saved addresses</div>
                <div className="tiny muted">Manage where we deliver</div>
              </span>
              <IconChevron size={17} />
            </Link>
            <Link to="/orders" className="list-item">
              <span className="list-item__art"><IconOrders size={18} /></span>
              <span className="grow">
                <div className="small" style={{ fontWeight: 600 }}>My orders</div>
                <div className="tiny muted">Track and reorder</div>
              </span>
              <IconChevron size={17} />
            </Link>
            {isAdmin && (
              <Link to="/admin" className="list-item">
                <span className="list-item__art"><IconShield size={18} /></span>
                <span className="grow">
                  <div className="small" style={{ fontWeight: 600 }}>Shop dashboard</div>
                  <div className="tiny muted">Orders, inventory and prices</div>
                </span>
                <IconChevron size={17} />
              </Link>
            )}
          </div>
        </section>

        <section className="card section">
          <h2 style={{ marginBottom: 10 }}>Preferences</h2>
          <p className="small muted" style={{ marginBottom: 10 }}>
            We will pre-select this at checkout.
          </p>
          <div className="row" style={{ gap: 8 }}>
            {[
              ['delivery', 'Home delivery'],
              ['pickup', 'Store pickup'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`chip ${preferredFulfilment === value ? 'is-active' : ''}`}
                onClick={() =>
                  savePreference('fulfilment', value)
                    .then(() => toast.success('Preference saved'))
                    .catch((error) => toast.error(error.message))
                }
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {store && (
          <section className="card section">
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <IconStore size={18} />
              <div className="small">
                <strong>{store.name}</strong>
                <div className="muted">{store.addressLine}, {store.city} {store.pincode}</div>
                <div className="tiny faint">
                  Open {store.opensAt?.slice(0, 5)} – {store.closesAt?.slice(0, 5)} · {store.phone}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="stack">
          <button type="button" className="btn btn--outline btn--block" onClick={() => setPasswordOpen(true)}>
            Change password
          </button>
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => logout().then(() => navigate('/'))}
          >
            <IconLogout size={17} /> Sign out
          </button>
        </div>
      </main>

      <Sheet open={editOpen} title="Edit profile" onClose={() => setEditOpen(false)}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await updateProfile({ name: form.name.trim(), email: form.email.trim() });
              toast.success('Profile updated');
              setEditOpen(false);
            } catch (error) {
              toast.error(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="profile-name">Full name</label>
            <input
              id="profile-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="profile-email">Email</label>
            <input
              id="profile-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="profile-phone">Mobile number</label>
            <input id="profile-phone" value={user?.phone ?? ''} disabled />
            <span className="field__hint">Your number is your sign-in — call the shop to change it.</span>
          </div>
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            Save changes
          </button>
        </form>
      </Sheet>

      <Sheet open={passwordOpen} title="Change password" onClose={() => setPasswordOpen(false)}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const result = await api.post('/auth/change-password', passwords);
              toast.success(result.message);
              setPasswordOpen(false);
              setPasswords({ currentPassword: '', newPassword: '' });
              await logout();
              navigate('/login');
            } catch (error) {
              toast.error(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="pw-current">Current password</label>
            <input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="pw-new">New password</label>
            <input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
            />
            <span className="field__hint">At least 8 characters. You will be signed out everywhere.</span>
          </div>
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            Update password
          </button>
        </form>
      </Sheet>
    </>
  );
};
