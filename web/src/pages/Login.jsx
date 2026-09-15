import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { toast } from '../store/ui.js';
import { PageBar } from '../components/TopBar.jsx';

export const LoginPage = () => {
  const login = useAuth((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const user = await login({ phone: form.phone.trim(), password: form.password });
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      const target = location.state?.from ?? (user.role === 'admin' ? '/admin' : '/');
      navigate(target, { replace: true });
    } catch (error) {
      setErrors(error.fieldErrors ?? {});
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageBar title="Sign in" />
      <main className="page" style={{ maxWidth: 460 }}>
        <div className="center" style={{ margin: '10px 0 22px' }}>
          <div style={{ fontSize: 40 }} aria-hidden="true">🛍️</div>
          <h1 style={{ marginTop: 8 }}>Welcome back</h1>
          <p className="small muted">Sign in with the mobile number you shop with.</p>
        </div>

        <form onSubmit={submit} noValidate>
          <div className={`field ${errors.phone ? 'field--error' : ''}`}>
            <label htmlFor="login-phone">Mobile number</label>
            <input
              id="login-phone"
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, '') })}
              placeholder="9876500002"
            />
            {errors.phone && <span className="field__error">{errors.phone}</span>}
          </div>

          <div className={`field ${errors.password ? 'field--error' : ''}`}>
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            {errors.password && <span className="field__error">{errors.password}</span>}
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="center small" style={{ marginTop: 18 }}>
          New here? <Link to="/register" className="btn btn--link">Create an account</Link>
        </p>

        <div className="pill-note" style={{ marginTop: 22 }}>
          <strong>Demo logins</strong>
          <div>Customer — 9876500002 / Customer@123</div>
          <div>Shop admin — 9876500001 / Admin@12345</div>
        </div>
      </main>
    </>
  );
};
