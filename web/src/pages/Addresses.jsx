import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../store/auth.js';
import { toast } from '../store/ui.js';
import { PageBar } from '../components/TopBar.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { AddressForm } from '../components/AddressForm.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconEdit, IconTrash } from '../components/Icons.jsx';

export const AddressesPage = () => {
  const user = useAuth((state) => state.user);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // address object, or 'new'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/addresses');
      setAddresses(data.addresses);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const remove = async (address) => {
    try {
      await api.del(`/addresses/${address.id}`);
      toast.info('Address removed');
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const makeDefault = async (address) => {
    try {
      const data = await api.post(`/addresses/${address.id}/default`);
      setAddresses(data.addresses);
      toast.success(`${address.label} is now your default`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <PageBar
        title="Addresses"
        action={
          <button type="button" className="btn btn--sm btn--primary" onClick={() => setEditing('new')}>
            Add new
          </button>
        }
      />
      <main className="page">
        {loading ? (
          <div className="stack">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="skeleton" style={{ height: 110 }} />
            ))}
          </div>
        ) : addresses.length === 0 ? (
          <EmptyState
            art="📍"
            title="No addresses saved"
            message="Add one so we know where to bring your groceries."
            action={
              <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
                Add an address
              </button>
            }
          />
        ) : (
          <div className="stack">
            {addresses.map((address) => (
              <article key={address.id} className="card">
                <div className="row row--between">
                  <div className="row" style={{ gap: 8 }}>
                    <strong className="small">{address.label}</strong>
                    {address.isDefault && <span className="badge badge--info">Default</span>}
                  </div>
                  {address.delivery?.serviceable ? (
                    <span className="badge badge--good">Free delivery · {address.delivery.distanceKm} km</span>
                  ) : (
                    <span className="badge badge--warn">Pickup only</span>
                  )}
                </div>

                <p className="small muted" style={{ marginTop: 8 }}>
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                  {address.landmark ? `, ${address.landmark}` : ''}
                  <br />
                  {address.city}, {address.state} {address.pincode}
                </p>
                <p className="tiny faint" style={{ marginTop: 4 }}>
                  {address.contactName} · {address.contactPhone}
                </p>

                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  {!address.isDefault && (
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => makeDefault(address)}>
                      Set default
                    </button>
                  )}
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(address)}>
                    <IconEdit size={15} /> Edit
                  </button>
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => remove(address)}>
                    <IconTrash size={15} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <Sheet
        open={Boolean(editing)}
        title={editing === 'new' ? 'New address' : 'Edit address'}
        onClose={() => setEditing(null)}
      >
        <AddressForm
          initial={
            editing === 'new'
              ? { contactName: user?.name ?? '', contactPhone: user?.phone ?? '' }
              : editing ?? {}
          }
          submitLabel={editing === 'new' ? 'Save address' : 'Update address'}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            if (editing === 'new') await api.post('/addresses', values);
            else await api.patch(`/addresses/${editing.id}`, values);
            setEditing(null);
            toast.success('Address saved');
            load();
          }}
        />
      </Sheet>
    </>
  );
};
