import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorHandler } from './http.js';
import authRoutes from './routes/auth.js';
import categoriesRoutes from './routes/categories.js';
import transactionsRoutes from './routes/transactions.js';
import budgetsRoutes from './routes/budgets.js';
import recurringRoutes from './routes/recurring.js';
import statsRoutes from './routes/stats.js';
import householdsRoutes from './routes/households.js';
import shoppingRoutes from './routes/shopping.js';
import receiptsRoutes from './routes/receipts.js';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Wyłączone upgrade-insecure-requests: wymuszałoby HTTPS także przy
        // serwowaniu po czystym HTTP (addon HA na porcie 4000) i łamało ładowanie
        // assetów (ERR_CONNECTION_RESET / ERR_SSL_PROTOCOL_ERROR). Assety są ładowane
        // relative ('self'), więc dyrektywa nie jest potrzebna nawet za HTTPS.
        upgradeInsecureRequests: null,
      },
    },
  })
);
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true,
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/budgets', budgetsRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/households', householdsRoutes);
app.use('/api/shopping-lists', shoppingRoutes);
app.use('/api/receipts', receiptsRoutes);

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Nie znaleziono endpointu' }));
app.use(errorHandler);

export default app;
