import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api/client.js';
import { formatPLN, formatDate, todayIso, FREQUENCY_LABELS } from '../utils/format.js';
import { Modal, Field, Loading, Empty, ConfirmDialog } from '../components/ui.jsx';

function RecurringModal({ title, initial, categories, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(form.id);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = {
        type: form.type,
        amount: form.amount,
        description: form.description,
        frequency: form.frequency,
        nextDate: form.nextDate,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
      };
      if (isEdit) {
        await api.patch(`/recurring/${form.id}`, body);
      } else {
        await api.post('/recurring', body);
      }
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const catsFor = (type) => categories.filter((c) => c.type === type);

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <Field label="Typ">
          <div className="segmented">
            <button
              type="button" className={form.type === 'expense' ? 'on' : ''}
              onClick={() => setForm({ ...form, type: 'expense', categoryId: '' })}
            >
              Wydatek
            </button>
            <button
              type="button" className={form.type === 'income' ? 'on' : ''}
              onClick={() => setForm({ ...form, type: 'income', categoryId: '' })}
            >
              Przychód
            </button>
          </div>
        </Field>
        <div className="form-row">
          <Field label="Kwota (zł)">
            <input
              className="input" required inputMode="decimal" placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Częstotliwość">
            <select
              className="select"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Opis">
          <input
            className="input" required maxLength={200} placeholder="np. Czynsz"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label="Kategoria">
          <select
            className="select"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            <option value="">— bez kategorii —</option>
            {catsFor(form.type).map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Data następnego obciążenia">
          <input
            className="input" type="date" required
            value={form.nextDate}
            onChange={(e) => setForm({ ...form, nextDate: e.target.value })}
          />
        </Field>
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

export default function Recurring() {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data.items)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/recurring');
      setItems(res.data.items);
      setError('');
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onToggle(r, active) {
    try {
      await api.patch(`/recurring/${r.id}`, { active });
      load();
    } catch (err) {
      setConfirmBox({ title: 'Błąd', message: errMsg(err) });
    }
  }

  function onDelete(r) {
    setConfirmBox({
      title: 'Usunąć wpis cykliczny?',
      message: `Usunąć wpis cykliczny „${r.description}"? Przestanie generować transakcje.`,
      onConfirm: async () => {
        try {
          await api.delete(`/recurring/${r.id}`);
          load();
        } catch (err) {
          setConfirmBox({ title: 'Błąd', message: errMsg(err) });
        }
      },
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Płatności cykliczne</h1>
          <div className="page-sub">
            Serwer sam dodaje transakcje wg harmonogramu (sprawdzenie co godzinę)
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() =>
            setModal({
              title: 'Nowy wpis cykliczny',
              initial: {
                type: 'expense',
                amount: '',
                description: '',
                frequency: 'monthly',
                nextDate: todayIso(),
                categoryId: '',
              },
            })
          }
        >
          + Nowy wpis
        </button>
      </div>

      <div className="card">
        {error && <p className="error-text">{error}</p>}
        {!items ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty
            emoji="🔁"
            title="Brak wpisów cyklicznych"
            hint="Dodaj czynsz, abonamenty itp. — transakcje utworzą się same"
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
          <thead>
            <tr>
              <th>Wpis</th>
              <th>Kwota</th>
              <th>Częstotliwość</th>
              <th>Następne</th>
              <th>Aktywne</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} style={r.active ? {} : { opacity: 0.55 }}>
                <td>
                  <div className="tx-main">
                    <span
                      className="tx-icon"
                      style={{ background: r.category_color ? `${r.category_color}22` : 'var(--bg)' }}
                    >
                      {r.category_icon || '🔁'}
                    </span>
                    <div>
                      <div className="tx-desc">{r.description}</div>
                      <div className="tx-sub">
                        {r.category_name ? `${r.category_icon} ${r.category_name}` : 'bez kategorii'}
                      </div>
                    </div>
                  </div>
                </td>
                    <td>
                      <span className={`amount-${r.type === 'income' ? 'pos' : 'neg'}`}>
                        {r.type === 'income' ? '+' : '−'}{formatPLN(r.amount)}
                      </span>
                    </td>
                    <td>{FREQUENCY_LABELS[r.frequency]}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.next_date)}</td>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={r.active}
                          onChange={(e) => onToggle(r, e.target.checked)}
                        />
                        <span className="track" />
                        <span className="thumb" />
                      </label>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost btn-icon" title="Edytuj"
                          onClick={() =>
                            setModal({
                              title: 'Edytuj wpis cykliczny',
                              initial: {
                                id: r.id,
                                type: r.type,
                                amount: String(r.amount),
                                description: r.description,
                                frequency: r.frequency,
                                nextDate: r.next_date,
                                categoryId: r.category_id ?? '',
                              },
                            })
                          }
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-ghost btn-icon" title="Usuń"
                          onClick={() => onDelete(r)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <RecurringModal
          title={modal.title}
          initial={modal.initial}
          categories={categories}
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
