import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useHouseholds } from '../context/HouseholdsContext.jsx';
import { Modal, Field, Loading, Empty, ProgressBar, ConfirmDialog } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

function ListModal({ title, initial, households, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(form.id);
  const showHousehold = !isEdit && households.length > 1;

  // Członkowie domu — źródło adresatów ("wyślij do")
  useEffect(() => {
    if (!form.householdId) return;
    setMembers([]);
    api
      .get(`/households/${form.householdId}`)
      .then((res) => setMembers(res.data.members))
      .catch(() => {});
  }, [form.householdId]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = {
        title: form.title,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
      };
      if (isEdit) {
        await api.patch(`/shopping-lists/${form.id}`, body);
      } else {
        body.householdId = Number(form.householdId);
        body.items = form.itemsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name) => ({ name }));
        await api.post('/shopping-lists', body);
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
        {showHousehold && (
          <Field label="Budżet domowy">
            <select
              className="select"
              value={form.householdId}
              onChange={(e) => setForm({ ...form, householdId: e.target.value, assigneeId: '' })}
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>🏠 {h.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Nazwa listy">
          <input
            className="input" required maxLength={100} placeholder="np. Zakupy spożywcze — weekend"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Wyślij do (opcjonalnie)">
          <select
            className="select"
            value={form.assigneeId}
            onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
          >
            <option value="">— dla całego domu —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
        {!isEdit && (
          <Field label="Pozycje (jedna na linię, opcjonalnie)">
            <textarea
              className="input" rows={5} maxLength={2000}
              placeholder={'np.\nMleko\nChleb\nMasło'}
              value={form.itemsText}
              onChange={(e) => setForm({ ...form, itemsText: e.target.value })}
              style={{ resize: 'vertical' }}
            />
          </Field>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button className="btn btn-primary" disabled={busy || !form.title.trim() || !form.householdId}>
            {busy ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ShoppingListCard({ list, onChanged, onEdit }) {
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [busy, setBusy] = useState(false);
  const isDone = list.status === 'done';
  const bought = list.items.filter((i) => i.bought).length;
  const [confirmBox, setConfirmBox] = useState(null);

  async function op(fn) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setConfirmBox({ title: 'Błąd', message: errMsg(err) });
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  function addItem(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const qty = newQty.trim();
    setNewName('');
    setNewQty('');
    op(() => api.post(`/shopping-lists/${list.id}/items`, { name, quantity: qty || null }));
  }

  return (
    <div className="card" style={{ marginBottom: 18, opacity: isDone ? 0.75 : 1 }}>
      <div className="card-title">
        <span>
          🛒 {list.title}
          <div className="tx-sub" style={{ marginTop: 3 }}>
            🏠 {list.household_name} · utworzył(a): {list.created_by_name} · {formatDate(list.created_at)}
          </div>
        </span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span className={`badge ${list.assignee_id ? 'badge-transfer' : 'badge-muted'}`}>
            {list.assignee_name ? `dla: ${list.assignee_name}` : 'dla całego domu'}
          </span>
          {isDone && <span className="badge badge-income">zakończona</span>}
        </span>
      </div>

      {list.items.length > 0 && (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
            Kupione: {bought}/{list.items.length}
          </div>
          <ProgressBar
            percent={list.items.length ? (bought / list.items.length) * 100 : 0}
            color={bought === list.items.length ? 'var(--green)' : 'var(--primary)'}
          />
          <div style={{ marginTop: 6 }}>
            {list.items.map((it) => (
              <div className="budget-row" key={it.id}>
                <div className="budget-top">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={it.bought}
                      disabled={busy || isDone}
                      onChange={(e) =>
                        op(() =>
                          api.patch(`/shopping-lists/${list.id}/items/${it.id}`, {
                            bought: e.target.checked,
                          })
                        )
                      }
                    />
                    <span className="track" />
                    <span className="thumb" />
                  </label>
                  <span
                    className="name"
                    style={it.bought ? { textDecoration: 'line-through', opacity: 0.55 } : {}}
                  >
                    {it.name}
                    {it.quantity && <div className="tx-sub">{it.quantity}</div>}
                  </span>
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Usuń pozycję"
                    disabled={busy}
                    onClick={() => op(() => api.delete(`/shopping-lists/${list.id}/items/${it.id}`))}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!isDone && (
        <form className="filters" style={{ marginTop: 10, marginBottom: 0 }} onSubmit={addItem}>
          <input
            className="input"
            placeholder="np. Mleko"
            value={newName}
            maxLength={120}
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1, minWidth: 120 }}
          />
          <input
            className="input"
            placeholder="np. 2 l"
            value={newQty}
            maxLength={40}
            onChange={(e) => setNewQty(e.target.value)}
            style={{ maxWidth: 90 }}
          />
          <button className="btn" disabled={busy || !newName.trim()}>+ Dodaj</button>
        </form>
      )}

      <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={() =>
              op(() =>
                api.patch(`/shopping-lists/${list.id}`, { status: isDone ? 'active' : 'done' })
              )
            }
          >
            {isDone ? '↩︎ Wznów' : '✓ Zakończ'}
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => onEdit(list)}>
            ✏️ Edytuj
          </button>
          <button
            className="btn btn-sm btn-danger"
            disabled={busy}
            onClick={() =>
              setConfirmBox({
                title: 'Usunąć listę?',
                message: `Usunąć listę „${list.title}" wraz z pozycjami?`,
                onConfirm: () => op(() => api.delete(`/shopping-lists/${list.id}`)),
              })
            }
          >
            🗑 Usuń
          </button>
        </div>
      </div>
      {confirmBox && <ConfirmDialog {...confirmBox} onClose={() => setConfirmBox(null)} />}
    </div>
  );
}

export default function Shopping() {
  const { user } = useAuth();
  const { households } = useHouseholds();
  const [lists, setLists] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(null);

  // Listy widoczne zawsze — ze wszystkich moich budżetów domowych, bez przełączania
  const load = useCallback(async () => {
    try {
      const res = await api.get('/shopping-lists');
      setLists(res.data.items);
      setError('');
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = (lists || []).filter((l) => l.status === 'active');
  const mine = active.filter((l) => l.assignee_id && String(l.assignee_id) === String(user?.id));
  const done = (lists || []).filter((l) => l.status === 'done');
  const shown = tab === 'mine' ? mine : tab === 'done' ? done : active;

  const TABS = [
    { key: 'all', label: 'Wszystkie' },
    { key: 'mine', label: `Wysłane do mnie${mine.length ? ` (${mine.length})` : ''}` },
    { key: 'done', label: 'Zakończone' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Zakupy</h1>
          <div className="page-sub">
            Wspólne listy zakupowe Twoich budżetów domowych — bez przełączania; wyślij listę konkretnej osobie, ona zobaczy ją w zakładce „Wysłane do mnie"
          </div>
        </div>
        {households.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={() =>
              setModal({
                title: 'Nowa lista zakupów',
                initial: {
                  title: '',
                  householdId: String(households[0].id),
                  assigneeId: '',
                  itemsText: '',
                },
              })
            }
          >
            + Nowa lista
          </button>
        )}
      </div>

      {households.length === 0 ? (
        <div className="card">
          <Empty
            emoji="🛒"
            title="Nie należysz jeszcze do żadnego budżetu domowego"
            hint="Listy zakupów działają w budżetach domowych — utwórz go w sekcji 🏠 Wspólne budżety i zaproś domowników"
          />
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 18, padding: '12px 16px' }}>
            <div className="segmented">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={tab === t.key ? 'on' : ''}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="card" style={{ marginBottom: 18 }}>
              <p className="error-text">{error}</p>
            </div>
          )}

          {!lists ? (
            <div className="card"><Loading /></div>
          ) : shown.length === 0 ? (
            <div className="card">
              <Empty
                emoji="🛒"
                title={
                  tab === 'mine'
                    ? 'Nie masz żadnych list wysłanych do Ciebie'
                    : tab === 'done'
                      ? 'Brak zakończonych list'
                      : 'Brak aktywnych list zakupów'
                }
                hint={tab === 'all' ? 'Kliknij „+ Nowa lista" i wyślij ją domownikowi' : undefined}
              />
            </div>
          ) : (
            shown.map((l) => (
              <ShoppingListCard
                key={l.id}
                list={l}
                onChanged={load}
                onEdit={(list) =>
                  setModal({
                    title: 'Edytuj listę zakupów',
                    initial: {
                      id: list.id,
                      householdId: String(list.household_id),
                      title: list.title,
                      assigneeId: list.assignee_id ? String(list.assignee_id) : '',
                      itemsText: '',
                    },
                  })
                }
              />
            ))
          )}
        </>
      )}

      {modal && (
        <ListModal
          title={modal.title}
          initial={modal.initial}
          households={households}
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
