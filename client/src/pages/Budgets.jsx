import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api/client.js';
import { formatPLN, ymNow, ymLabel } from '../utils/format.js';
import { MonthNav, ProgressBar, Loading, Empty, ConfirmDialog } from '../components/ui.jsx';

export default function Budgets() {
  const [ym, setYm] = useState(ymNow());
  const [data, setData] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/budgets', { params: { month: ym } });
      setData(res.data);
      setAmount(res.data.budget ? String(res.data.budget.amount) : '');
      setError('');
    } catch (err) {
      setError(errMsg(err));
    }
  }, [ym]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSave(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api.post('/budgets', { month: ym, amount });
      setMsg('Limit zapisany');
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  function onRemove() {
    if (!data?.budget) return;
    setConfirmBox({
      title: 'Usunąć limit wydatków?',
      message: `Usunąć limit wydatków na ${ymLabel(ym)}?`,
      onConfirm: reallyRemove,
    });
  }

  async function reallyRemove() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api.delete(`/budgets/${data.budget.id}`);
      setMsg('Limit usunięty');
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const budget = data?.budget;
  const spent = data?.spent ?? 0;
  const pct = budget ? (spent / budget.amount) * 100 : 0;
  const left = budget ? budget.amount - spent : 0;
  const barColor = pct >= 100 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--green)';
  const hasSpend = spent > 0 || (data?.uncategorized ?? 0) > 0 || (data?.categories?.length ?? 0) > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Budżet</h1>
          <div className="page-sub">
            Jeden miesięczny limit wydatków — kategorie przy transakcjach pokażą, na co poszły pieniądze
          </div>
        </div>
      </div>

      <div className="filters">
        <MonthNav ym={ym} onYm={setYm} today />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        {error && <p className="error-text">{error}</p>}
        {msg && (
          <p style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>{msg}</p>
        )}
        {!data ? (
          <Loading />
        ) : (
          <>
            <div className="card-title">Limit wydatków — {ymLabel(ym)}</div>

            {budget && (
              <div className="budget-row">
                <div className="budget-top">
                  <span className="name" style={{ fontWeight: 800 }}>
                    Wydane łącznie
                  </span>
                  <span
                    className="budget-nums"
                    style={left < 0 ? { color: 'var(--red)', fontWeight: 700 } : {}}
                  >
                    {formatPLN(spent)} / {formatPLN(budget.amount)} ({Math.round(pct)}%)
                  </span>
                </div>
                <ProgressBar percent={pct} color={barColor} />
                <div style={{ fontWeight: 700, color: left < 0 ? 'var(--red)' : 'var(--green)' }}>
                  {left >= 0 ? `Zostało: ${formatPLN(left)}` : `Przekroczono o ${formatPLN(-left)}`}
                </div>
              </div>
            )}

            <form className="filters" style={{ marginTop: budget ? 14 : 0 }} onSubmit={onSave}>
              <input
                className="input"
                required
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ maxWidth: 160 }}
                title="Miesięczny limit wydatków (zł)"
              />
              <button className="btn btn-primary" disabled={busy || !amount.trim()}>
                {budget ? 'Zmień limit' : 'Ustaw limit'}
              </button>
              {budget && (
                <button type="button" className="btn btn-danger" disabled={busy} onClick={onRemove}>
                  Usuń limit
                </button>
              )}
            </form>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>
              Limit działa per budżet (osobisty/domowy) i per miesiąc — ustaw raz, przy kolejnych miesiącach
              podpowiedzią jest kwota z poprzedniego.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Na co poszło — {ymLabel(ym)}</div>
        {!data ? (
          <Loading />
        ) : !hasSpend ? (
          <Empty
            emoji="🏷️"
            title="Brak wydatków w tym miesiącu"
            hint="Dodaj transakcje w zakładce Transakcje — rozbicie pojawi się tutaj"
          />
        ) : (
          data.categories.map((c) => {
            const share = spent ? (c.spent / spent) * 100 : 0;
            return (
              <div className="budget-row" key={c.id}>
                <div className="budget-top">
                  <span className="tx-icon" style={{ background: `${c.color}22` }}>
                    {c.icon}
                  </span>
                  <span className="name">{c.name}</span>
                  <span className="budget-nums">
                    {formatPLN(c.spent)} ({Math.round(share)}%)
                  </span>
                </div>
                <ProgressBar percent={share} color={c.color} />
              </div>
            );
          })
        )}
        {data && data.uncategorized > 0 && (
          <div className="budget-row">
            <div className="budget-top">
              <span className="tx-icon" style={{ background: 'var(--bg)' }}>❔</span>
              <span className="name">Bez kategorii</span>
              <span className="budget-nums">
                {formatPLN(data.uncategorized)} ({Math.round((data.uncategorized / (spent || 1)) * 100)}%)
              </span>
            </div>
            <ProgressBar percent={spent ? (data.uncategorized / spent) * 100 : 0} color="var(--muted)" />
          </div>
        )}
      </div>
      {confirmBox && <ConfirmDialog {...confirmBox} onClose={() => setConfirmBox(null)} />}
    </>
  );
}
