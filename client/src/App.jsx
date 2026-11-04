import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Transactions from './pages/Transactions.jsx';
import Budgets from './pages/Budgets.jsx';
import Categories from './pages/Categories.jsx';
import Recurring from './pages/Recurring.jsx';
import Households from './pages/Households.jsx';
import Shopping from './pages/Shopping.jsx';

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="page-center"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/transakcje" element={<Transactions />} />
        <Route path="/budzety" element={<Budgets />} />
        <Route path="/kategorie" element={<Categories />} />
            <Route path="/cykliczne" element={<Recurring />} />
            <Route path="/zakupy" element={<Shopping />} />
            <Route path="/domowe" element={<Households />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
