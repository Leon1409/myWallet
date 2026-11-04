import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errMsg } from '../api/client.js';
import { Field } from '../components/ui.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków');
      return;
    }
    setBusy(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-brand">
          <div className="brand-mark">💰</div> MyWallet
        </div>
        <form onSubmit={onSubmit}>
          <Field label="Imię">
            <input
              className="input" required maxLength={80} autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="E-mail">
            <input
              className="input" type="email" required autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Hasło (min. 8 znaków)">
            <input
              className="input" type="password" required minLength={8} autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Tworzenie konta…' : 'Utwórz konto'}
          </button>
        </form>
        <div className="auth-switch">
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </div>
      </div>
    </div>
  );
}
