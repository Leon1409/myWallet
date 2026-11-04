import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { api, errMsg } from '../api/client.js';
import { formatPLN, formatDate, ymNow, COLORS } from '../utils/format.js';
import { MonthNav, ProgressBar, Loading, Empty } from '../components/ui.jsx';

function Kpi({ label, value, positive }) {
  const cls = positive === true ? 'pos' : positive === false ? 'neg' : '';
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={`value ${cls}`}>{formatPLN(value)}</div>
    </div>
  );
}

export default function Dashboard() {
  const [ym, setYm] = useState(ymNow());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    api
      .get('/stats/summary', { params: { month: ym } })
      .then((res) => alive && setData(res.data))
      .catch((err) => alive && setError(errMsg(err)));
    return () => {
      alive = false;
    };
  }, [ym]);

  if (error) return <div className="card"><p className="error-text">{error}</p></div>;
  if (!data) return <Loading />;

  const totalExpense = data.byCategory.reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pulpit</h1>
          <div className="page-sub">Przegląd budżetu za miesiąc</div>
        </div>
        <MonthNav ym={ym} onYm={setYm} today />
      </div>

      <div className="grid grid-kpi">
        <Kpi label="Przychody" value={data.income} positive />
        <Kpi label="Wydatki" value={data.expense} positive={false} />
        <Kpi
          label="Bilans"
          value={data.net}
          positive={data.net >= 0}
        />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-title">Przepływ w miesiącu</div>
          {data.daily.every((d) => !d.expense && !d.income) ? (
            <Empty emoji="📈" title="Brak transakcji w tym miesiącu" hint="Dodaj pierwszą transakcję" />
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => d.slice(8)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <Tooltip
                    formatter={(value) => formatPLN(value)}
                    labelFormatter={(d) => formatDate(d)}
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                  <Bar dataKey="expense" name="Wydatki" fill={COLORS.red} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="income" name="Przychody" fill={COLORS.green} radius={[4, 4, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Wydatki wg kategorii</div>
          {data.byCategory.length === 0 ? (
            <Empty emoji="🍰" title="Brak wydatków" hint="Pojawi się tutaj po dodaniu wydatków" />
          ) : (
            <>
              <div className="chart-box" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.byCategory}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {data.byCategory.map((c) => (
                        <Cell key={c.id} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatPLN(value)}
                      contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="donut-legend">
                {data.byCategory.slice(0, 5).map((c) => (
                  <div className="legend-row" key={c.id}>
                    <span className="swatch" style={{ background: c.color }} />
                    <span className="legend-name">{c.icon} {c.name}</span>
                    <span className="legend-amount">{formatPLN(c.amount)}</span>
                    <span className="legend-pct">
                      {totalExpense ? Math.round((c.amount / totalExpense) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Budżet na {ym}</div>
        {!data.budget ? (
          <Empty emoji="🎯" title="Brak limitu na ten miesiąc" hint="Ustaw miesięczny limit w zakładce Budżety" />
        ) : (
          (() => {
            const pct = data.budget.amount ? (data.budget.spent / data.budget.amount) * 100 : 0;
            const left = data.budget.amount - data.budget.spent;
            const color = pct >= 100 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--green)';
            return (
              <>
                <div className="budget-row">
                  <div className="budget-top">
                    <span className="name">Miesięczny limit wydatków</span>
                    <span className="budget-nums">
                      {formatPLN(data.budget.spent)} / {formatPLN(data.budget.amount)} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <ProgressBar percent={pct} color={color} />
                </div>
                <div style={{ fontWeight: 700, color: left < 0 ? 'var(--red)' : 'var(--green)' }}>
                  {left >= 0 ? `Zostało: ${formatPLN(left)}` : `Przekroczono o ${formatPLN(-left)}`}
                </div>
              </>
            );
          })()
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-title">Ostatnie transakcje</div>
        {data.recent.length === 0 ? (
          <Empty emoji="💸" title="Brak transakcji" hint="Dodaj pierwszą transakcję w zakładce Transakcje" />
        ) : (
          data.recent.map((t) => (
            <div className="budget-row" key={t.id}>
              <div className="budget-top">
                <span
                  className="tx-icon"
                  style={{ background: t.category_color ? `${t.category_color}22` : 'var(--bg)' }}
                >
                  {t.category_icon || '💸'}
                </span>
                <span className="name">
                  {t.category_name || 'Bez kategorii'}
                  <div className="tx-sub">{t.description || formatDate(t.date)}</div>
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>{formatDate(t.date)}</span>
                <span className={`amount-${t.type === 'income' ? 'pos' : 'neg'}`}>
                  {t.type === 'income' ? '+' : '−'}{formatPLN(t.amount)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
