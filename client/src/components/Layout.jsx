import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useHouseholds } from '../context/HouseholdsContext.jsx';

const NAV = [
  { to: '/', label: 'Pulpit', icon: '📊', end: true },
  { to: '/transakcje', label: 'Transakcje', icon: '💸' },
  { to: '/budzety', label: 'Budżety', icon: '🎯' },
  { to: '/kategorie', label: 'Kategorie', icon: '🏷️' },
  { to: '/cykliczne', label: 'Cykliczne', icon: '🔁' },
  { to: '/zakupy', label: 'Zakupy', icon: '🛒' },
  { to: '/domowe', label: 'Wspólne budżety', icon: '🏠' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { households, invites, current, switchTo } = useHouseholds();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const initials = (user?.name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="app-shell">
      {open && (
        <div
          className="modal-overlay"
          style={{ zIndex: 35, background: 'rgba(20,22,36,0.35)', padding: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">💰</div>
          MyWallet
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{initials}</div>
          <div className="user-meta">
            <div className="name">{user?.name}</div>
            <div className="email">{user?.email}</div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto' }}
            title="Wyloguj"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            ⎋
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            ☰
          </button>
          <select
            className="select budget-switch"
            value={current ? String(current.id) : ''}
            onChange={(e) => switchTo(e.target.value || null)}
            title="Aktywny budżet"
          >
            <option value="">👤 Mój budżet</option>
            {households.map((h) => (
              <option key={h.id} value={String(h.id)}>
                🏠 {h.name}
              </option>
            ))}
          </select>
          {invites.length > 0 && (
            <NavLink to="/domowe" className="btn btn-sm invite-badge">
              📬 Zaproszenia ({invites.length})
            </NavLink>
          )}
          <div style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--muted)' }}>
            {current ? `Wspólny budżet: ${current.name}` : 'Twój budżet'}
          </div>
        </div>
        <div className="page">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
