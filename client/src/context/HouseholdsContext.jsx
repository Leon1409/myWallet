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
      const items = res.data.items;
      setHouseholds(items);
      setInvites(res.data.invites);

      const savedId = localStorage.getItem('householdId');
      if (savedId === 'personal') {
        // Jawnie wybrany budżet osobisty — nie ruszaj (domyślny dom go nie nadpisze)
        setCurrentId(null);
      } else if (savedId) {
        if (!items.some((h) => String(h.id) === savedId)) {
          // Członkostwo wygasło — wróć do reguł domyślnych
          localStorage.removeItem('householdId');
          setCurrentId(null);
        }
      } else {
        // Brak jawnego wyboru (nowe urządzenie / po zalogowaniu) — startuj
        // od domyślnego budżetu ustawionego na koncie, jeśli taki jest
        const def = items.find((h) => h.is_default);
        if (def) {
          localStorage.setItem('householdId', String(def.id));
          setCurrentId(String(def.id));
        } else {
          setCurrentId(null);
        }
      }
    } catch {
      /* niedostępne — zostaw puste */
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
    // Czyszczenie tylko przy braku sesji (wylogowanie) — NIE przy user=null
    // na starcie, gdy /auth/me jeszcze leci (gubiłoby householdId zapisany
    // przez switchTo przed reloadem i selekt wracał na "Mój budżet").
    else if (!localStorage.getItem('token')) {
      localStorage.removeItem('householdId');
      setHouseholds([]);
      setInvites([]);
      setCurrentId(null);
    }
  }, [user, refresh]);

  const current = households.find((h) => String(h.id) === currentId) || null;

  // Przełączenie kontekstu odświeża całą aplikację (dane są pobierane per budżet).
  // null/'' zapisuje się jako 'personal' — to ŚWIADOMY wybór osobistego, którego
  // domyślny budżet z konta nie może nadpisać (od 'braku wyboru' różni się tym,
  // że po odświeżeniu nie wrócimy na dom domyślny).
  function switchTo(householdId) {
    if (householdId == null || householdId === '') localStorage.setItem('householdId', 'personal');
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
