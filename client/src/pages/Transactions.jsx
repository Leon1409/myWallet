import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, downloadCsv } from '../api/client.js';
import { formatPLN, formatDate, todayIso, ymNow, ymRange } from '../utils/format.js';
import { Modal, Field, Loading, Empty, MonthNav, ConfirmDialog } from '../components/ui.jsx';

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

// Zmniejsza zdjęcie przed wysłaniem (paragony z telefonu potrafią ważyć kilka MB;
// 1600px JPEG wystarcza AI do odczytu, a upload leci szybciej)
async function shrinkImage(file, maxDim = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
}

// Import transakcji ze zdjęcia paragonu: upload -> AI czyta pozycje ->
// podgląd i korekta -> jedna zbiorcza transakcja wydatku z podpiętym zdjęciem
function ReceiptModal({ categories, onClose, onSaved }) {
  const [stage, setStage] = useState('pick'); // pick -> parsing -> review
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [form, setForm] = useState({ amount: '', date: todayIso(), categoryId: '', description: '' });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function onPick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError('');
    setBusy(true);
    setStage('parsing');
    try {
      const small = await shrinkImage(file);
      setPreviewUrl(URL.createObjectURL(small));
      const fd = new FormData();
      fd.append('image', small, 'receipt.jpg');
      const res = await api.post('/receipts', fd);
      const r = res.data;
      setReceipt(r);
      setForm({
        amount: r.total ? String(r.total) : '',
        date: r.date || todayIso(),
        categoryId: r.categoryId != null ? String(r.categoryId) : '',
        description: r.store || 'Zakupy',
      });
      setStage('review');
    } catch (err) {
      setError(errMsg(err));
      setStage('pick');
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/transactions', {
        type: 'expense',
        amount: form.amount,
        date: form.date,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        description: form.description || null,
        receiptId: receipt.receiptId,
      });
      onSaved(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const expenseCats = categories.filter((c) => c.type === 'expense');

  return (
    <Modal title="Dodaj z paragonu" onClose={onClose}>
      {stage === 'pick' && (
        <div>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 12px' }}>
            Zrób lub wybierz zdjęcie paragonu — AI odczyta sklep, datę, sumę i zaproponuje
            kategorię, a Ty tylko zatwierdzisz.
          </p>
          <label className="btn btn-primary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
            📷 Wybierz zdjęcie paragonu
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={onPick}
            />
          </label>
        </div>
      )}

      {stage === 'parsing' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 40 }}>🧾</div>
          <p style={{ fontWeight: 600 }}>AI czyta paragon…</p>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>zwykle 5–20 sekund</p>
        </div>
      )}

      {stage === 'review' && receipt && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="paragon"
                style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 10 }}
              />
            )}
            <div style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>
              {receipt.store && <div>Sklep: <b style={{ color: 'var(--text)' }}>{receipt.store}</b></div>}
              {receipt.date && (
                <div>
                  Data z paragonu: {receipt.date}
                  {receipt.date !== todayIso() && (
                    <span style={{ color: 'var(--amber, #d97706)', fontWeight: 700 }}>
                      {' '}— inna niż dziś (transakcja trafi do tego miesiąca)
                    </span>
                  )}
                </div>
              )}
              {receipt.total != null && <div>Suma odczytana: {formatPLN(receipt.total)}</div>}
              {!receipt.total && (
                <div className="error-text">Nie odczytano sumy — wpisz kwotę ręcznie poniżej</div>
              )}
            </div>
          </div>

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
              required
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
            >
              <option value="">— wybierz kategorię —</option>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Opis">
            <input
              className="input" maxLength={200}
              value={form.description || ''}
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>

          {error && <p className="error-text">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>Anuluj</button>
            <button className="btn btn-primary" disabled={busy || !form.amount || !form.categoryId} onClick={onSave}>
              {busy ? 'Zapisywanie…' : 'Zapisz transakcję'}
            </button>
          </div>
        </div>
      )}

      {stage === 'pick' && error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
    </Modal>
  );
}

// Podgląd zapisanego zdjęcia paragonu (pobierany blob-em z auth)
function ReceiptPreviewModal({ tx, onClose }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl;
    api
      .get(`/receipts/${tx.receipt_id}/image`, { responseType: 'blob' })
      .then((res) => {
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => setError('Nie udało się pobrać zdjęcia paragonu'));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tx.receipt_id]);

  return (
    <Modal title={`Paragon — ${tx.description || 'zakupy'}`} onClose={onClose}>
      {error && <p className="error-text">{error}</p>}
      {!url && !error && <Loading />}
      {url && (
        <img src={url} alt="paragon" style={{ width: '100%', borderRadius: 10 }} />
      )}
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
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [previewTx, setPreviewTx] = useState(null); // transakcja z paragonem
  const [confirmBox, setConfirmBox] = useState(null);

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

  function onDelete(t) {
    const desc = t.description || t.category_name || '';
    setConfirmBox({
      title: 'Usunąć transakcję?',
      message: `Usunąć transakcję ${desc} na ${formatPLN(t.amount)}?`,
      onConfirm: async () => {
        try {
          await api.delete(`/transactions/${t.id}`);
          load();
        } catch (err) {
          setConfirmBox({ title: 'Błąd', message: errMsg(err) });
        }
      },
    });
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
      setConfirmBox({ title: 'Błąd eksportu', message: errMsg(err) });
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
          <button className="btn" onClick={() => setReceiptOpen(true)}>📷 Z paragonu</button>
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
                          {t.receipt_id && (
                            <button
                              className="btn btn-ghost btn-icon" title="Zdjęcie paragonu"
                              onClick={() => setPreviewTx(t)}
                            >
                              🧾
                            </button>
                          )}
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

      {receiptOpen && (
        <ReceiptModal
          categories={categories}
          onClose={() => setReceiptOpen(false)}
          onSaved={(tx) => {
            setReceiptOpen(false);
            // Przeskocz na miesiąc zapisanej transakcji — inaczej wpis z
            // paragonu o starej dacie "znika" z widoku (lista filtruje miesiąc)
            if (tx?.date) setYm(tx.date.slice(0, 7));
            setPage(1);
          }}
        />
      )}

      {previewTx && <ReceiptPreviewModal tx={previewTx} onClose={() => setPreviewTx(null)} />}

      {confirmBox && <ConfirmDialog {...confirmBox} onClose={() => setConfirmBox(null)} />}
    </>
  );
}
