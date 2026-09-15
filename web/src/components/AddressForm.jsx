import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { toast } from '../store/ui.js';
import { IconPin, IconSpinner } from './Icons.jsx';

const blank = {
  label: 'Home',
  contactName: '',
  contactPhone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: 'Thrissur',
  state: 'Kerala',
  pincode: '',
  latitude: null,
  longitude: null,
};

const LABELS = ['Home', 'Work', 'Other'];

/**
 * Address capture with two ways to put the address on the map:
 * the browser's GPS (exact), or the PIN code centroid (good enough to decide
 * whether a house is inside the 5 km ring). The delivery verdict is shown
 * live so nobody discovers at checkout that we cannot reach them.
 */
export const AddressForm = ({ initial, onSubmit, onCancel, submitLabel = 'Save address' }) => {
  const [form, setForm] = useState({ ...blank, ...initial });
  const [errors, setErrors] = useState({});
  const [quote, setQuote] = useState(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pincodes, setPincodes] = useState([]);

  useEffect(() => {
    api
      .get('/store/pincodes')
      .then((data) => setPincodes(data.pincodes))
      .catch(() => setPincodes([]));
  }, []);

  // Re-quote whenever the pinned point moves.
  useEffect(() => {
    if (form.latitude == null || form.longitude == null) {
      setQuote(null);
      return;
    }
    api
      .get(`/store/delivery-quote?latitude=${form.latitude}&longitude=${form.longitude}`)
      .then((data) => setQuote(data.quote))
      .catch(() => setQuote(null));
  }, [form.latitude, form.longitude]);

  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const applyPincode = async (pincode) => {
    setForm((current) => ({ ...current, pincode }));
    if (!/^\d{6}$/.test(pincode)) return;
    try {
      const data = await api.get(`/store/pincode/${pincode}`);
      setForm((current) => ({
        ...current,
        city: data.city,
        state: data.state,
        // Only adopt the centroid if GPS has not already given us a fix.
        latitude: current.latitude ?? data.latitude,
        longitude: current.longitude ?? data.longitude,
      }));
    } catch (error) {
      toast.info(error.message);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('This browser cannot share your location — pick your PIN code instead');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setForm((current) => ({
          ...current,
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        }));
        toast.success('Location pinned');
      },
      () => {
        setLocating(false);
        toast.error('Could not read your location. Choose your PIN code instead.');
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (form.contactName.trim().length < 2) nextErrors.contactName = 'Who should we hand the order to?';
    if (!/^[6-9]\d{9}$/.test(form.contactPhone.trim())) nextErrors.contactPhone = 'Enter a valid 10 digit mobile number';
    if (form.line1.trim().length < 4) nextErrors.line1 = 'House / flat and street are needed';
    if (!/^\d{6}$/.test(form.pincode.trim())) nextErrors.pincode = 'Enter a valid 6 digit PIN code';
    if (form.latitude == null) nextErrors.pincode = 'Pin your location or pick a known PIN code';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      await onSubmit({
        ...form,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        line1: form.line1.trim(),
        line2: form.line2.trim(),
        landmark: form.landmark.trim(),
      });
    } catch (error) {
      setErrors(error.fieldErrors ?? {});
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, props = {}) => (
    <div className={`field ${errors[key] ? 'field--error' : ''}`}>
      <label htmlFor={`addr-${key}`}>{label}</label>
      <input id={`addr-${key}`} value={form[key] ?? ''} onChange={set(key)} {...props} />
      {errors[key] && <span className="field__error">{errors[key]}</span>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <div className="row row--wrap" style={{ marginBottom: 12 }}>
        {LABELS.map((label) => (
          <button
            key={label}
            type="button"
            className={`chip ${form.label === label ? 'is-active' : ''}`}
            onClick={() => setForm((current) => ({ ...current, label }))}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="field-row">
        {field('contactName', 'Receiver name', { autoComplete: 'name' })}
        {field('contactPhone', 'Mobile number', {
          inputMode: 'numeric',
          maxLength: 10,
          autoComplete: 'tel-national',
        })}
      </div>

      {field('line1', 'House / flat, street', { autoComplete: 'address-line1' })}
      {field('line2', 'Area, locality (optional)', { autoComplete: 'address-line2' })}
      {field('landmark', 'Landmark (optional)', { placeholder: 'e.g. opposite the temple' })}

      <div className="field-row">
        <div className={`field ${errors.pincode ? 'field--error' : ''}`}>
          <label htmlFor="addr-pincode">PIN code</label>
          <input
            id="addr-pincode"
            list="ks-pincodes"
            inputMode="numeric"
            maxLength={6}
            value={form.pincode}
            onChange={(event) => applyPincode(event.target.value.trim())}
          />
          <datalist id="ks-pincodes">
            {pincodes.map((p) => (
              <option key={p.pincode} value={p.pincode}>{p.area}</option>
            ))}
          </datalist>
          {errors.pincode && <span className="field__error">{errors.pincode}</span>}
        </div>
        {field('city', 'City')}
      </div>

      <button
        type="button"
        className="btn btn--outline btn--block"
        onClick={useMyLocation}
        disabled={locating}
        style={{ marginBottom: 12 }}
      >
        {locating ? <span className="spin"><IconSpinner size={17} /></span> : <IconPin size={17} />}
        {form.latitude == null ? 'Use my current location' : 'Re-pin my exact location'}
      </button>

      {quote && (
        <div className={`banner ${quote.serviceable ? '' : 'banner--warn'}`} style={{ marginBottom: 12 }}>
          <span aria-hidden="true">{quote.serviceable ? '🛵' : '🏪'}</span>
          <div>
            {quote.serviceable ? (
              <>
                <strong>Free delivery — about {quote.distanceKm} km away</strong>
                <div className="small">Usually arrives in {quote.etaMinutes} minutes</div>
              </>
            ) : (
              <>
                <strong>Outside our delivery ring</strong>
                <div className="small">{quote.reason}</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10 }}>
        {onCancel && (
          <button type="button" className="btn btn--outline grow" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary grow" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
};
