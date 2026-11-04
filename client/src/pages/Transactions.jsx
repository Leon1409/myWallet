import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, downloadCsv } from '../api/client.js';
import { formatPLN, formatDate, todayIso, ymNow, ymRange } from '../utils/format.js';
import { Modal, Field, Loading, Empty, MonthNav } from '../components/ui.jsx';

const LIMIT = 25;

const emptyForm = () => ({
  mode: 'expense',
  amount: '',
  date: todayIso(),
  categoryId: '',
  description: '',
});

function TxModal({ title, categories, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isEdit = title.startsWith('Edytuj');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = {
        type: form.mode,
        amount: form.amount,
        date: form.date,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        description: form.description || null,
      };
      if (isEdit) {
        await api.patch(`/transactions/${form.id}`, body);
      } else {
        await api.post('/transactions', body);
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
        {!isEdit && (
          <div className="field">
            <div className="segmented">
              {[
                ['expense', 'Wydatek'],
                ['income', 'Przychód'],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={form.mode === mode ? 'on' : ''}
                  onClick={() => set({ mode, categoryId: '' })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="form-row">
          <Field label="Kwota (zł)">
            <input
              className="input" required inputMode="decimal" placeholder="0,00"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </Field>
          <Field label="Data">
            <input
              className="input" type="date" required
              value={form.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Kategoria">
          <select
            className="select"
            required={form.mode === 'expense'}
            value={form.categoryId}
            onChange={(e) => set({ categoryId: e.target.value })}
          >
            <option value="">— bez kategorii —</option>
            {catsFor(form.mode === 'income' ? 'income' : 'expense').map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Opis">
          <input
            className="input" maxLength={200}
            placeholder="np. zakupy w Biedronce"
            value={form.description || ''}
            onChange={(e) => set({ description: e.target.value })}
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

export default function Transactions() {
  const [ym, setYm] = useState(ymNow());
  const [filters, setFilters] = useState({ categoryId: '', type: '', search: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { title, initial }

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data.items)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const [from, to] = ymRange(ym);
    const params = {
      from,
      to,
      page,
      limit: LIMIT,
      categoryId: filters.categoryId || undefined,
      type: filters.type || undefined,
      search: filters.search.trim() || undefined,
    };
    try {
      const res = await api.get('/transactions', { params });
      setData(res.data);
      setError('');
    } catch (err) {
      setError(errMsg(err));
    }
  }, [ym, page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete(t) {
    const msg = `Usunąć transakcję ${t.description || t.category_name || ''} na ${formatPLN(t.amount)}?`;
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/transactions/${t.id}`);
      load();
    } catch (err) {
      window.alert(errMsg(err));
    }
  }

  async function onExport() {
    const [from, to] = ymRange(ym);
    const qs = new URLSearchParams({ from, to });
    if (filters.categoryId) qs.set('categoryId', filters.categoryId);
    if (filters.type) qs.set('type', filters.type);
    if (filters.search.trim()) qs.set('search', filters.search.trim());
    try {
      await downloadCsv(`/transactions/export?${qs}`, `transakcje_${ym}.csv`);
    } catch (err) {
      window.alert(errMsg(err));
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transakcje</h1>
          <div className="page-sub">Przeglądaj, dodawaj i edytuj przychody oraz wydatki</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onExport}>⬇ Eksport CSV</button>
          <button
            className="btn btn-primary"
            onClick={() => setModal({ title: 'Nowa transakcja', initial: emptyForm() })}
          >
            + Dodaj transakcję
          </button>
        </div>
      </div>

      <div className="filters">
        <MonthNav ym={ym} onYm={(v) => { setYm(v); setPage(1); }} today />
        <select
          className="select select-sm"
          value={filters.type}
          onChange={(e) => { setFilters((f) => ({ ...f, type: e.target.value })); setPage(1); }}
        >
          <option value="">Wszystkie typy</option>
          <option value="income">Przychody</option>
          <option value="expense">Wydatki</option>
        </select>
        <select
          className="select select-sm"
          value={filters.categoryId}
          onChange={(e) => { setFilters((f) => ({ ...f, categoryId: e.target.value })); setPage(1); }}
        >
          <option value="">Wszystkie kategorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        <input
          className="input" style={{ minWidth: 180 }}
          placeholder="Szukaj opisu lub kategorii…"
          value={filters.search}
          onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
        />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { setFilters({ categoryId: '', type: '', search: '' }); setPage(1); }}
        >
          Wyczyść
        </button>
      </div>

      <div className="card">
        {error && <p className="error-text">{error}</p>}
        {!data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <Empty
            emoji="🔍"
            title="Brak transakcji"
            hint="Zmień filtry albo dodaj nową transakcję przyciskiem u góry"
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Transakcja</th>
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>Kwota</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="tx-main">
                          <span
                            className="tx-icon"
                            style={{ background: t.category_color ? `${t.category_color}22` : 'var(--bg)' }}
                          >
                            {t.category_icon || '💸'}
                          </span>
                          <div>
                            <div className="tx-desc">{t.description || t.category_name || 'Transakcja'}</div>
                            <div className="tx-sub">
                              {t.category_name ? `${t.category_icon} ${t.category_name}` : 'bez kategorii'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`amount-${t.type === 'income' ? 'pos' : 'neg'}`}>
                          {t.type === 'income' ? '+' : '−'}{formatPLN(t.amount)}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-ghost btn-icon" title="Edytuj"
                            onClick={() =>
                              setModal({
                                title: 'Edytuj transakcję',
                                initial: {
                                  id: t.id,
                                  mode: t.type,
                                  amount: String(t.amount),
                                  date: t.date,
                                  categoryId: t.category_id ?? '',
                                  description: t.description || '',
                                },
                              })
                            }
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-ghost btn-icon" title="Usuń"
                            onClick={() => onDelete(t)}
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
            {data.total > 0 && (
              <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
                Suma: przychody <span className="amount-pos">{formatPLN(data.totals.income)}</span>{' '}
                · wydatki <span className="amount-neg">{formatPLN(data.totals.expense)}</span>
              </div>
            )}
            {pages > 1 && (
              <div className="pager">
                <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
                <span>Strona {page} z {pages} ({data.total})</span>
                <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>→</button>
              </div>
            )}
          </>
        )}
      </div>

      {modal && (
        <TxModal
          title={modal.title}
          categories={categories}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </>
  );
}
