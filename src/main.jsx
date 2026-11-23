import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import 'katex/dist/katex.min.css';
import './styles.css';
import './pdf.css';
import App from './App.jsx';
import { requestPersistentStorage } from './install.js';
import './updater.js';
import { migrateOldDb } from './db.js';

requestPersistentStorage();

// Eski addaki ('ders-defteri') veritabanı varsa önce taşınsın, sonra arayüz açılsın
migrateOldDb().finally(() =>
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);
