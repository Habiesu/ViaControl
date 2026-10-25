import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

// Parche de foco para Electron en Windows:
// Al cerrar diálogos nativos (window.confirm, etc.) o cambiar de vistas,
// Chromium a veces desvincula el foco del teclado hasta que se hace Alt+Tab.
if (typeof window !== 'undefined' && window.require) {
  try {
    const { ipcRenderer } = window.require('electron');
    const refocus = () => {
      window.focus();
      ipcRenderer.invoke('app:refocusWindow').catch(() => {});
    };

    const origConfirm = window.confirm;
    window.confirm = function(...args) {
      const res = origConfirm.apply(window, args);
      setTimeout(refocus, 40);
      return res;
    };

    const origAlert = window.alert;
    window.alert = function(...args) {
      const res = origAlert.apply(window, args);
      setTimeout(refocus, 40);
      return res;
    };

    // Al hacer mousedown en cualquier input, asegurar que el proceso principal le otorgue foco a webContents
    document.addEventListener('mousedown', (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (!document.hasFocus()) refocus();
      }
    }, true);
  } catch {}
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
