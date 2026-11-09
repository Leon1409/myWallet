import { useEffect, useState } from 'react';
import { api, errMsg } from '../api/client.js';
import { useHouseholds } from '../context/HouseholdsContext.jsx';
import { Modal, Field, Loading, Empty, ConfirmDialog } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

function InviteRow({ invite, busy, onAccept, onDecline }) {
  return (
    <div className="budget-row">
      <div className="budget-top">
        <span className="tx-icon" style={{ background: 'var(--primary-soft)' }}>🏠</span>
        <span className="name">
          {invite.household_name}
          <div className="tx-sub">
            zaprasza: {invite.invited_by_name} · {formatDate(invite.created_at)}
          </div>
        </span>
        <span className="row-actions">
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={onAccept}>
            Dołącz
          </button>
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onDecline}>
            Odrzuć
          </button>
        </span>
      </div>
    </div>
  );
}

function HouseholdCard({ hh, currentId, switchTo, onChanged, onGone }) {
  const [detail, setDetail] = useState(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [confirmBox, setConfirmBox] = useState(null);
  const isCurrent = currentId === String(hh.id);

  async function load() {
    try {
      const res = await api.get(`/households/${hh.id}`);
      setDetail(res.data);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hh.id]);

  async function invite() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api.post(`/households/${hh.id}/invites`, { email });
      setMsg('Zaproszenie oczekuje — druga osoba zobaczy je w aplikacji po zalogowaniu');
      setEmail('');
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inviteId) {
    setError('');
    try {
      await api.delete(`/households/${hh.id}/invites/${inviteId}`);
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function removeMember(userId) {
    setError('');
    try {
      await api.delete(`/households/${hh.id}/members/${userId}`);
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function rename() {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/households/${hh.id}`, { name: renameName });
      setRenameOpen(false);
      await load();
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    setConfirmBox({
      title: 'Opuścić budżet domowy?',
      message: 'Przestaniesz widzieć jego dane. Chcesz kontynuować?',
      confirmLabel: 'Opuść',
      onConfirm: async () => {
        setError('');
        try {
          await api.post(`/households/${hh.id}/leave`);
          if (isCurrent) onGone();
          else await onChanged();
        } catch (err) {
          setError(errMsg(err));
        }
      },
    });
  }

  // Ustaw/ściągnij domyślny budżet (per konto — działa na każdym urządzeniu po zalogowaniu)
  async function setDefault() {
    setError('');
    try {
      await api.put(`/households/${hh.id}/default`);
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function unsetDefault() {
    setError('');
    try {
      await api.delete(`/households/${hh.id}/default`);
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  function remove() {
    setConfirmBox({
      title: `Usunąć budżet „${hh.name}”?`,
      message: `Usunąć budżet domowy „${hh.name}" wraz ze WSZYSTKIMI danymi (transakcje, budżety, listy zakupów)? Tej operacji nie można cofnąć.`,
      confirmLabel: 'Usuń budżet',
      onConfirm: async () => {
        setError('');
        try {
          await api.delete(`/households/${hh.id}`);
          if (isCurrent) onGone();
          else await onChanged();
        } catch (err) {
          setError(errMsg(err));
        }
      },
    });
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title">
        <span>🏠 {hh.name}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hh.is_default && (
            <span
              className="badge"
              style={{ background: 'var(--green-soft, rgba(16,185,129,.14))', color: 'var(--green)' }}
              title="Budżet startuje automatycznie po zalogowaniu"
            >
              ★ Domyślny
            </span>
          )}
          <span className="badge badge-muted">
            {hh.role === 'owner' ? 'Właściciel' : 'Członek'} · {hh.member_count} os.
          </span>
          <button
            className="btn btn-sm btn-primary"
            disabled={isCurrent}
            onClick={() => switchTo(hh.id)}
          >
            {isCurrent ? '✓ Aktywny' : 'Przełącz się'}
          </button>
        </span>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 10 }}>{error}</p>}
      {msg && (
        <p style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>
          {msg}
        </p>
      )}

      {!detail ? (
        <Loading />
      ) : (
        <>
          <div className="card-title" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            Członkowie
          </div>
          {detail.members.map((m) => (
            <div className="budget-row" key={m.id}>
              <div className="budget-top">
                <span className="tx-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary-dark)' }}>
                  {(m.name || '?')[0]?.toUpperCase()}
                </span>
                <span className="name">
                  {m.name}
                  <div className="tx-sub">{m.email} · dołączył(a) {formatDate(m.joined_at)}</div>
                </span>
                <span className="badge badge-muted">{m.role === 'owner' ? 'Właściciel' : 'Członek'}</span>
                {hh.role === 'owner' && m.role !== 'owner' && (
                  <button className="btn btn-sm btn-ghost" onClick={() => removeMember(m.id)}>
                    Usuń
                  </button>
                )}
              </div>
            </div>
          ))}

          {hh.role === 'owner' && (
            <>
              <div className="card-title" style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0 4px' }}>
                Zaproś domownika (e-mail)
              </div>
              <div className="filters" style={{ marginBottom: 4 }}>
                <input
                  className="input"
                  type="email"
                  placeholder="e-mail osoby — musi mieć konto w MyWallet"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ maxWidth: 320 }}
                  maxLength={80}
                />
                <button className="btn" disabled={busy || !email.trim()} onClick={invite}>
                  Zaproś
                </button>
              </div>
              {detail.invites.map((inv) => (
                <div className="budget-row" key={inv.id}>
                  <div className="budget-top">
                    <span className="tx-icon" style={{ background: 'var(--amber-soft)' }}>✉️</span>
                    <span className="name">
                      {inv.email}
                      <div className="tx-sub">zaproszenie z {formatDate(inv.created_at)}</div>
                    </span>
                    <button className="btn btn-sm btn-ghost" onClick={() => revoke(inv.id)}>
                      Cofnij
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: 18 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {hh.role === 'owner' && (
                <>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setRenameName(hh.name);
                      setRenameOpen(true);
                    }}
                  >
                    ✏️ Zmień nazwę
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={remove}>
                    🗑 Usuń budżet
                  </button>
                </>
              )}
              {hh.role !== 'owner' && (
                <button className="btn btn-sm" onClick={leave}>
                  ⎋ Opuść budżet
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {hh.is_default ? (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={unsetDefault}
                  title="Domyślny budżet wróci na osobisty"
                >
                  ★ Domyślny — przestań
                </button>
              ) : (
                <button
                  className="btn btn-sm"
                  onClick={setDefault}
                  title="Ten budżet będzie się sam włączać po zalogowaniu (na każdym urządzeniu)"
                >
                  ★ Ustaw jako domyślny
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {renameOpen && (
        <Modal title="Zmień nazwę budżetu domowego" onClose={() => setRenameOpen(false)}>
          <Field label="Nazwa">
            <input
              className="input"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </Field>
          <div className="form-actions">
            <button className="btn" onClick={() => setRenameOpen(false)}>
              Anuluj
            </button>
            <button className="btn btn-primary" disabled={busy || !renameName.trim()} onClick={rename}>
              Zapisz
            </button>
          </div>
        </Modal>
      )}

      {confirmBox && <ConfirmDialog {...confirmBox} onClose={() => setConfirmBox(null)} />}
    </div>
  );
}

export default function Households() {
  const { households, invites, currentId, switchTo, refresh } = useHouseholds();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteBusy, setInviteBusy] = useState(null);

  async function create() {
    setCreating(true);
    setCreateError('');
    try {
      await api.post('/households', { name });
      setName('');
      await refresh();
    } catch (err) {
      setCreateError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  async function acceptInvite(invite) {
    setInviteBusy(invite.id);
    setInviteError('');
    setInviteMsg('');
    try {
      const res = await api.post(`/households/invites/${invite.id}/accept`);
      setInviteMsg(`Dołączono do budżetu „${res.data.household.name}" — możesz do niego przełączyć się u góry`);
      await refresh();
    } catch (err) {
      setInviteError(errMsg(err));
    } finally {
      setInviteBusy(null);
    }
  }

  async function declineInvite(invite) {
    setInviteBusy(invite.id);
    setInviteError('');
    setInviteMsg('');
    try {
      await api.post(`/households/invites/${invite.id}/decline`);
      await refresh();
    } catch (err) {
      setInviteError(errMsg(err));
    } finally {
      setInviteBusy(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Wspólne budżety</h1>
          <div className="page-sub">
            Zaproś domowników po e-mailu i prowadźcie jeden budżet razem — wszyscy widzą te same wydatki
          </div>
        </div>
      </div>

      {invites.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-title">📬 Zaproszenia dla Ciebie</div>
          {inviteError && <p className="error-text" style={{ marginBottom: 10 }}>{inviteError}</p>}
          {inviteMsg && (
            <p style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>
              {inviteMsg}
            </p>
          )}
          {invites.map((i) => (
            <InviteRow
              key={i.id}
              invite={i}
              busy={inviteBusy === i.id}
              onAccept={() => acceptInvite(i)}
              onDecline={() => declineInvite(i)}
            />
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title">Nowy wspólny budżet</div>
        <div className="filters" style={{ marginBottom: 8 }}>
          <input
            className="input"
            placeholder="np. Dom, Mieszkanie, Budżet z Anią…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ maxWidth: 320 }}
            maxLength={60}
          />
          <button className="btn btn-primary" disabled={creating || !name.trim()} onClick={create}>
            Utwórz
          </button>
        </div>
        {createError && <p className="error-text" style={{ marginBottom: 8 }}>{createError}</p>}
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Po utworzeniu zaproś drugą osobę podając jej e-mail — zaproszenie pojawi się w jej aplikacji
          po zalogowaniu. Nowy budżet dostaje własne konta, kategorie i transakcje.
        </p>
      </div>

      {households.length === 0 ? (
        <div className="card">
          <Empty
            emoji="🏠"
            title="Nie należysz jeszcze do żadnego wspólnego budżetu"
            hint="Utwórz budżet powyżej albo poczekaj na zaproszenie"
          />
        </div>
      ) : (
        households.map((hh) => (
          <HouseholdCard
            key={hh.id}
            hh={hh}
            currentId={currentId}
            switchTo={switchTo}
            onChanged={refresh}
            onGone={() => switchTo(null)}
          />
        ))
      )}
    </>
  );
}
