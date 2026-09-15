import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { toast } from '../store/ui.js';
import { PageBar } from '../components/TopBar.jsx';

export const RegisterPage = () => {
  const register = useAuth((state) => state.register);
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name';
    if (!/^[6-9]\d{9}$/.test(form.phone)) next.phone = 'Enter a valid 10 digit mobile number';
    if (form.password.length < 8) next.password = 'Use at least 8 characters';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const user = await register({
        name: form.name.trim(),
        phone: form.phone,
        email: form.email.trim() || undefined,
        password: form.password,
      });
      toast.success(`Welcome, ${user.name.split(' ')[0]}!`);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (error) {
      setErrors(error.fieldErrors ?? {});
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, props = {}) => (
    <div className={`field ${errors[key] ? 'field--error' : ''}`}>
      <label htmlFor={`reg-${key}`}>{label}</label>
      <input
        id={`reg-${key}`}
        value={form[key]}
        onChange={(event) =>
          setForm({
            ...form,
            [key]: key === 'phone' ? event.target.value.replace(/\D/g, '') : event.target.value,
          })
        }
        {...props}
      />
      {errors[key] && <span className="field__error">{errors[key]}</span>}
    </div>
  );

  return (
    <>
      <PageBar title="Create account" />
      <main className="page" style={{ maxWidth: 460 }}>
        <div className="center" style={{ margin: '10px 0 22px' }}>
          <h1>Join Karthika Stores</h1>
          <p className="small muted">One account for delivery, pickup and your order history.</p>
        </div>

        <form onSubmit={submit} noValidate>
          {field('name', 'Full name', { autoComplete: 'name' })}
          {field('phone', 'Mobile number', { inputMode: 'numeric', maxLength: 10, autoComplete: 'tel-national' })}
          {field('email', 'Email (optional)', { type: 'email', autoComplete: 'email' })}
          {field('password', 'Password', { type: 'password', autoComplete: 'new-password' })}
          <p className="field__hint" style={{ marginTop: -6, marginBottom: 14 }}>
            At least 8 characters. Stored hashed with bcrypt — never in plain text.
          </p>

          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Creating your account…' : 'Create account'}
          </button>
        </form>

        <p className="center small" style={{ marginTop: 18 }}>
          Already shopping with us? <Link to="/login" className="btn btn--link">Sign in</Link>
        </p>
      </main>
    </>
  );
};
