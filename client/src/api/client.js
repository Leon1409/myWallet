import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // 'personal' = jawnie wybrany budżet osobisty (bez nagłówka domowego)
  const householdId = localStorage.getItem('householdId');
  if (householdId && householdId !== 'personal') config.headers['X-Household-Id'] = householdId;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('token');
      location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const errMsg = (err) => err?.response?.data?.error || 'Coś poszło nie tak. Spróbuj ponownie.';

export async function downloadCsv(url, filename) {
  const res = await api.get(url, { responseType: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(res.data);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
