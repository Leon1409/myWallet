import { useEffect } from 'react';
import { ymShift, ymLabel, ymNow } from '../utils/format.js';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Zamknij">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Potwierdzenie/komunikat zamiast natywnych window.confirm/alert — te w PWA
// (zainstalowana apka) wyglądają jak obcy systemowy popup z adresem strony.
// onConfirm == null -> wariant "samo OK" (komunikat), inaczej Anuluj + akcja.
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ color: 'var(--text)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.55 }}>
        {message}
      </p>
      <div className="form-actions">
        {onConfirm ? (
          <>
            <button className="btn" onClick={onClose}>Anuluj</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel || 'Usuń'}
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={onClose}>OK</button>
        )}
      </div>
    </Modal>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function Loading() {
  return <div className="loading-row"><Spinner /></div>;
}

export function Empty({ emoji = '📭', title = 'Brak danych', hint }) {
  return (
    <div className="empty">
      <div className="emoji">{emoji}</div>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function MonthNav({ ym, onYm, today }) {
  const btn = 'btn btn-sm';
  return (
    <div className="month-nav">
      <button className={btn} onClick={() => onYm(ymShift(ym, -1))} aria-label="Poprzedni miesiąc">◀</button>
      <span className="month-label">{ymLabel(ym)}</span>
      <button className={btn} onClick={() => onYm(ymShift(ym, 1))} aria-label="Następny miesiąc">▶</button>
      {today && (
        <button className={`${btn} btn-ghost`} onClick={() => onYm(ymNow())}>Dziś</button>
      )}
    </div>
  );
}

export function ProgressBar({ percent, color }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="progress">
      <div style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}
