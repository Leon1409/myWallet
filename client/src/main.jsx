import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { HouseholdsProvider } from './context/HouseholdsContext.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <HouseholdsProvider>
          <App />
        </HouseholdsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
