import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useStoreInfo } from '../../store/storeInfo.js';
import { toast } from '../../store/ui.js';
import { IconQr } from '../../components/Icons.jsx';

export const AdminSettings = () => {
  const { store, deliveryZones } = useStoreInfo();
  const reloadStore = useStoreInfo((state) => state.load);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!store) return;
    setForm({
      name: store.name,
      tagline: store.tagline ?? '',
      phone: store.phone,
      opensAt: store.opensAt?.slice(0, 5) ?? '07:00',
      closesAt: store.closesAt?.slice(0, 5) ?? '21:30',
      freeDeliveryRadiusKm: String(store.freeDeliveryRadiusKm),
      maxDeliveryRadiusKm: String(store.maxDeliveryRadiusKm),
      minOrderRupees: String(store.minOrderPaise / 100),
      basePrepMinutes: String(store.basePrepMinutes),
      acceptsPayLater: store.acceptsPayLater,
      upiVpa: store.upiVpa ?? '',
      upiPayeeName: store.upiPayeeName ?? store.name,
      acceptsUpiQr: store.acceptsUpiQr ?? false,
    });
  }, [store]);

  if (!form) return <div className="skeleton" style={{ height: 300 }} />;

  const set = (key) => (event) =>
    setForm((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.patch('/admin/store', {
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        phone: form.phone.trim(),
        opensAt: form.opensAt,
        closesAt: form.closesAt,
        freeDeliveryRadiusKm: Number(form.freeDeliveryRadiusKm),
        maxDeliveryRadiusKm: Number(form.maxDeliveryRadiusKm),
        minOrderPaise: Math.round(Number(form.minOrderRupees) * 100),
        basePrepMinutes: Number(form.basePrepMinutes),
        acceptsPayLater: form.acceptsPayLater,
        upiVpa: form.upiVpa.trim(),
        upiPayeeName: form.upiPayeeName.trim(),
        acceptsUpiQr: form.acceptsUpiQr,
      });
      await reloadStore();
      toast.success('Shop settings updated');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <section className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginBottom: 12 }}>Shop details</h2>
        <div className="field">
          <label htmlFor="s-name">Shop name</label>
          <input id="s-name" value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="s-tagline">Tagline</label>
          <input id="s-tagline" value={form.tagline} onChange={set('tagline')} />
        </div>
        <div className="field">
          <label htmlFor="s-phone">Phone</label>
          <input id="s-phone" value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="s-open">Opens at</label>
            <input id="s-open" type="time" value={form.opensAt} onChange={set('opensAt')} />
          </div>
          <div className="field">
            <label htmlFor="s-close">Closes at</label>
            <input id="s-close" type="time" value={form.closesAt} onChange={set('closesAt')} />
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginBottom: 12 }}>Delivery</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="s-free">Free radius (km)</label>
            <input id="s-free" inputMode="decimal" value={form.freeDeliveryRadiusKm} onChange={set('freeDeliveryRadiusKm')} />
          </div>
          <div className="field">
            <label htmlFor="s-max">Maximum radius (km)</label>
            <input id="s-max" inputMode="decimal" value={form.maxDeliveryRadiusKm} onChange={set('maxDeliveryRadiusKm')} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="s-min">Minimum delivery order (₹)</label>
            <input id="s-min" inputMode="decimal" value={form.minOrderRupees} onChange={set('minOrderRupees')} />
            <span className="field__hint">Store pickup has no minimum.</span>
          </div>
          <div className="field">
            <label htmlFor="s-prep">Packing time (min)</label>
            <input id="s-prep" inputMode="numeric" value={form.basePrepMinutes} onChange={set('basePrepMinutes')} />
          </div>
        </div>

        <label className={`radio-card ${form.acceptsPayLater ? 'is-active' : ''}`}>
          <input type="checkbox" checked={form.acceptsPayLater} onChange={set('acceptsPayLater')} />
          <div>
            <strong className="small">Accept pay-on-delivery and pay-at-store</strong>
            <div className="tiny muted">Turn off to take prepaid orders only</div>
          </div>
        </label>

        {deliveryZones?.length > 0 && (
          <div className="pill-note" style={{ marginTop: 12 }}>
            <strong>Active zones</strong>
            {deliveryZones.map((zone) => (
              <div key={zone.name}>
                {zone.name} — up to {zone.maxDistanceKm} km,{' '}
                {zone.deliveryFeePaise ? `₹${zone.deliveryFeePaise / 100} fee` : 'free'}, ETA {zone.etaMinutes} min
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="row" style={{ gap: 8, marginBottom: 4 }}>
          <IconQr size={18} /> UPI payments
        </h2>
        <p className="tiny muted" style={{ marginBottom: 12 }}>
          Customers scan a QR built from this UPI ID and pay straight into the shop&apos;s account.
          There is no gateway in between, so every payment has to be confirmed by hand from the
          Orders screen once the bank alert arrives.
        </p>

        <div className="field">
          <label htmlFor="s-vpa">Shop UPI ID</label>
          <input
            id="s-vpa"
            value={form.upiVpa}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="karthikastores@okicici"
            onChange={set('upiVpa')}
          />
          <span className="field__hint">
            Check this character by character — money scanned against a wrong ID goes to whoever
            owns it, and cannot be pulled back.
          </span>
        </div>

        <div className="field">
          <label htmlFor="s-payee">Name shown in the customer&apos;s UPI app</label>
          <input id="s-payee" value={form.upiPayeeName} onChange={set('upiPayeeName')} />
        </div>

        <label className={`radio-card ${form.acceptsUpiQr ? 'is-active' : ''}`}>
          <input type="checkbox" checked={form.acceptsUpiQr} onChange={set('acceptsUpiQr')} />
          <div>
            <strong className="small">Offer UPI QR at checkout</strong>
            <div className="tiny muted">
              Turn off to take orders on handover only — useful if nobody is free to watch the bank
              alerts today.
            </div>
          </div>
        </label>

        {!store?.onlinePaymentEnabled && (
          <div className="pill-note" style={{ marginTop: 12 }}>
            Card and netbanking payments are switched off on the server
            (<code>PAYMENT_PROVIDER=none</code>). UPI QR and pay-on-handover are what customers see.
          </div>
        )}
      </section>

      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Saving…' : 'Save shop settings'}
      </button>
    </form>
  );
};
