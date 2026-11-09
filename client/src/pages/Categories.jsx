import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api/client.js';
import { ICONS } from '../utils/format.js';
import { Modal, Field, Loading, Empty, ConfirmDialog } from '../components/ui.jsx';

function CategoryModal({ title, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(form.id);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = { name: form.name, type: form.type, color: form.color, icon: form.icon };
      if (isEdit) {
        await api.patch(`/categories/${form.id}`, body);
      } else {
        await api.post('/categories', body);
      }
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <Field label="Nazwa">
          <input
            className="input" required maxLength={60} placeholder="np. Kawa"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        {!isEdit && (
          <Field label="Typ">
            <div className="segmented">
              <button
                type="button" className={form.type === 'expense' ? 'on' : ''}
                onClick={() => setForm({ ...form, type: 'expense' })}
              >
                Wydatek
              </button>
              <button
                type="button" className={form.type === 'income' ? 'on' : ''}
                onClick={() => setForm({ ...form, type: 'income' })}
              >
                Przychód
              </button>
            </div>
          </Field>
        )}
        <div className="form-row">
          <Field label="Ikona">
            <select
              className="select"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            >
              {ICONS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </Field>
          <Field label="Kolor">
            <input
              className="input" style={{ height: 41, padding: 4 }}
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </Field>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Categories() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/categories');
      setItems(res.data.items);
      setError('');
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onDelete(c) {
    setConfirmBox({
      title: 'Usunąć kategorię?',
      message: `Usunąć kategorię „${c.name}"? Transakcje z nią powiązane zostaną bez kategorii.`,
      onConfirm: async () => {
        try {
          await api.delete(`/categories/${c.id}`);
          load();
        } catch (err) {
          setConfirmBox({ title: 'Błąd', message: errMsg(err) });
        }
      },
    });
  }

  const groups = [
    { type: 'expense', title: 'Wydatki', emoji: '💸' },
    { type: 'income', title: 'Przychody', emoji: '💰' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kategorie</h1>
          <div className="page-sub">Porządkuj transakcje w kategorie z ikonami i kolorami</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setModal({ title: 'Nowa kategoria', initial: { name: '', type: 'expense', color: '#635bff', icon: '📦' } })}
        >
          + Nowa kategoria
        </button>
      </div>

      {error && <div className="card"><p className="error-text">{error}</p></div>}
      {!items ? (
        <Loading />
      ) : (
        groups.map((g) => (
          <div key={g.type} style={{ marginBottom: 22 }}>
            <div className="card-title">
              {g.emoji} {g.title}
              <span className="badge badge-muted">{items.filter((c) => c.type === g.type).length}</span>
            </div>
            {items.filter((c) => c.type === g.type).length === 0 ? (
              <div className="card">
                <Empty emoji="🏷️" title={`Brak kategorii ${g.title.toLowerCase()}`} />
              </div>
            ) : (
              <div className="cat-grid">
                {items
                  .filter((c) => c.type === g.type)
                  .map((c) => (
                    <div className="cat-card" key={c.id}>
                      <span className="tx-icon" style={{ background: `${c.color}22` }}>{c.icon}</span>
                      <span className="cat-name" style={{ borderBottom: `3px solid ${c.color}` }}>
                        {c.name}
                      </span>
                      <button
                        className="btn btn-ghost btn-icon" title="Edytuj"
                        onClick={() =>
                          setModal({
                            title: 'Edytuj kategorię',
                            initial: { id: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon },
                          })
                        }
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-ghost btn-icon" title="Usuń"
                        onClick={() => onDelete(c)}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))
      )}

      {modal && (
        <CategoryModal
          title={modal.title}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {confirmBox && <ConfirmDialog {...confirmBox} onClose={() => setConfirmBox(null)} />}
    </>
  );
}
