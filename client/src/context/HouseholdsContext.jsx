import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const Ctx = createContext(null);

export function HouseholdsProvider({ children }) {
  const { user } = useAuth();
  const [households, setHouseholds] = useState([]);
  const [invites, setInvites] = useState([]);
  const [currentId, setCurrentId] = useState(() => localStorage.getItem('householdId') || null);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    try {
      const res = await api.get('/households');
      setHouseholds(res.data.items);
      setInvites(res.data.invites);
      const savedId = localStorage.getItem('householdId');
      if (savedId && !res.data.items.some((h) => String(h.id) === savedId)) {
        localStorage.removeItem('householdId');
        setCurrentId(null);
      }
    } catch {
      /* niedostępne — zostaw puste */
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
    else {
      localStorage.removeItem('householdId');
      setHouseholds([]);
      setInvites([]);
      setCurrentId(null);
    }
  }, [user, refresh]);

  const current = households.find((h) => String(h.id) === currentId) || null;

  // Przełączenie kontekstu odświeża całą aplikację (dane są pobierane per budżet)
  function switchTo(householdId) {
    if (householdId == null || householdId === '') localStorage.removeItem('householdId');
    else localStorage.setItem('householdId', String(householdId));
    window.location.reload();
  }

  return (
    <Ctx.Provider value={{ households, invites, current, currentId, switchTo, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useHouseholds = () => useContext(Ctx);
