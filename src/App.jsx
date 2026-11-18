import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import AuthGuard, { useAuth } from './components/AuthGuard.jsx';
import UpdateNotifier from './components/UpdateNotifier.jsx';

const PropietariosView = lazy(() => import('./views/PropietariosView.jsx'));
const NuevoViajeView = lazy(() => import('./views/NuevoViajeView.jsx'));
const HistorialViajesView = lazy(() => import('./views/HistorialViajesView.jsx'));
const LiquidacionSemanalView = lazy(() => import('./views/LiquidacionSemanalView.jsx'));
const AnalisisMensualView = lazy(() => import('./views/AnalisisMensualView.jsx'));
const IERView = lazy(() => import('./views/IERView.jsx'));
const SaldosPropietariosView = lazy(() => import('./views/SaldosPropietariosView.jsx'));
const RutasView = lazy(() => import('./views/RutasView.jsx'));
const GastosExtraView = lazy(() => import('./views/GastosExtraView.jsx'));
const AjustesView = lazy(() => import('./views/AjustesView.jsx'));

const { ipcRenderer } = window.require('electron');

const TABS = {
  'nuevo-viaje':  { label: 'Registro de Nuevo Viaje',                   breadcrumb: 'Despacho',       icon: 'add_circle',    nav: 'Registrar Viaje' },
  'viajes':       { label: 'Historial & Bitácora de Viajes',             breadcrumb: 'Telemetría',     icon: 'history_edu',   nav: 'Historial de Viajes' },
  'liquidacion':  { label: 'Resumen de Liquidaciones a Choferes',        breadcrumb: 'Finanzas',       icon: 'receipt_long',  nav: 'Resumen Liquidaciones' },
  'analisis':     { label: 'Análisis de Rentabilidad por Gandola',       breadcrumb: 'P&L',            icon: 'trending_up',   nav: 'Rentabilidad de Flota' },
  'ier':                  { label: 'Gestión IER – Entrega y Recaudación',          breadcrumb: 'P&L',            icon: 'fact_check',            nav: 'Gestión IER' },
  'saldos-propietarios':  { label: 'Control de Saldos por Agentes y Propietarios', breadcrumb: 'Finanzas',       icon: 'account_balance_wallet',nav: 'Saldos de Agentes' },
  'propietarios':         { label: 'Propietarios, Choferes y Gandolas',          breadcrumb: 'Gestión',        icon: 'local_shipping',        nav: 'Propietarios y Choferes' },
  'rutas':                { label: 'Catálogo de Tarifas y Rutas Dinámicas',      breadcrumb: 'Catálogo',       icon: 'explore',               nav: 'Rutas y Tarifas' },
  'gastos_extra':         { label: 'Gastos de Mantenimiento, Taller y Flota',    breadcrumb: 'Mantenimiento',  icon: 'build',                 nav: 'Gastos de Taller y Flota' },
  'ajustes':              { label: 'Ajustes del Sistema',                        breadcrumb: 'Sistema',        icon: 'settings',              nav: 'Ajustes' },
};

const NAV_GROUPS = [
  ['nuevo-viaje', 'viajes', 'liquidacion', 'analisis', 'ier'],
  ['saldos-propietarios', 'propietarios', 'rutas', 'gastos_extra'],
];

function AppContent({ onRegisterRefresh }) {
  const { triggerSync } = useAuth();
  const [currentTab, setCurrentTab] = useState('nuevo-viaje');
  const [pageSubtitle, setPageSubtitle] = useState(null); // dynamic subtitle override
  const [catalogos, setCatalogos] = useState({
    rutas: [], origenes: [], choferes: [], gandolas: [], propietarios: [],
  });
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState('light');

  // Cargar tema guardado al iniciar
  useEffect(() => {
    ipcRenderer.invoke('theme:get').then(saved => {
      setTheme(saved || 'light');
    }).catch(() => setTheme('light'));
  }, []);

  // También en <body>: los modales de AuthGuard se dibujan fuera de .app-container
  useEffect(() => { document.body.classList.toggle('light-mode', theme === 'light'); }, [theme]);

  const cambiarTema = async (next) => {
    setTheme(next);
    await ipcRenderer.invoke('theme:set', next);
  };

  const loadCatalogos = async () => {
    try {
      const res = await ipcRenderer.invoke('catalogos:obtener');
      if (res.ok) setCatalogos(res.data);
      else showToast(res.error, 'error');
    } catch (err) {
      showToast('Error al conectar con la base de datos: ' + err.message, 'error');
    }
  };

  const showToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => {
    loadCatalogos();

    if (onRegisterRefresh) {
      onRegisterRefresh((count) => {
        showToast(`Sincronización: ${count} registro(s) actualizados desde la nube`);
        loadCatalogos();
      });
    }
  }, []);

  // Clear subtitle on tab change
  const handleTabChange = (key) => { setCurrentTab(key); setPageSubtitle(null); };

  const tab = TABS[currentTab];
  const viewProps = { catalogos, showToast };

  return (
    <div className={`app-container${theme === 'light' ? ' light-mode' : ''}`}>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark" aria-hidden="true"><i></i><i></i></div>
          <div>
            <div className="brand-title">ViaControl</div>
            <div className="brand-subtitle">Gestión de flota</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 && <div className="nav-divider" />}
              {group.map(key => (
                <div
                  key={key}
                  className={`nav-item ${currentTab === key ? 'active' : ''}`}
                  onClick={() => handleTabChange(key)}
                >
                  <span className="material-symbols-outlined">{TABS[key].icon}</span>
                  <span>{TABS[key].nav}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div
            className={`nav-item ajustes-nav-btn ${currentTab === 'ajustes' ? 'active' : ''}`}
            onClick={() => handleTabChange('ajustes')}
          >
            <span className="material-symbols-outlined">settings</span>
            <span>Ajustes</span>
          </div>
        </div>
      </aside>

      {/* MAIN LAYOUT */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <div className="topbar-breadcrumb">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>radar</span>
              <span>Módulo</span>
              <span style={{ color: 'var(--outline-variant)' }}>/</span>
              <span className="accent">{tab?.breadcrumb}</span>
            </div>
            <h1>{pageSubtitle || tab?.label}</h1>
          </div>
          <div className="topbar-actions">
            {currentTab !== 'nuevo-viaje' && (
              <button
                className="btn btn-primary btn-sm btn-nuevo-viaje-top"
                onClick={() => handleTabChange('nuevo-viaje')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                <span>Nuevo Viaje</span>
              </button>
            )}
          </div>
        </header>

        <div className="content-body">
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '12px', color: 'var(--primary)' }}>
              <span className="material-symbols-outlined spinning" style={{ fontSize: '32px' }}>sync</span>
              <span style={{ fontWeight: 600, fontFamily: 'Inter' }}>Cargando módulo...</span>
            </div>
          }>
            {currentTab === 'nuevo-viaje' && (
              <NuevoViajeView
                {...viewProps}
                onViajeGuardado={() => { showToast('¡Viaje registrado y guardado con éxito!'); loadCatalogos(); triggerSync(); }}
                onActualizarCatalogos={loadCatalogos}
              />
            )}
            {currentTab === 'viajes' && (
              <HistorialViajesView {...viewProps} onActualizarCatalogos={loadCatalogos} />
            )}
            {currentTab === 'liquidacion' && <LiquidacionSemanalView {...viewProps} onSubtitleChange={setPageSubtitle} />}
            {currentTab === 'analisis' && <AnalisisMensualView {...viewProps} />}
            {currentTab === 'ier' && <IERView {...viewProps} />}
            {currentTab === 'saldos-propietarios' && (
              <SaldosPropietariosView {...viewProps} onReloadCatalogos={loadCatalogos} />
            )}
            {currentTab === 'propietarios' && (
              <PropietariosView {...viewProps} onActualizar={loadCatalogos} />
            )}
            {currentTab === 'rutas' && <RutasView {...viewProps} onActualizar={loadCatalogos} />}
            {currentTab === 'gastos_extra' && <GastosExtraView {...viewProps} />}
            {currentTab === 'ajustes' && <AjustesView {...viewProps} theme={theme} onThemeChange={cambiarTema} />}
          </Suspense>
        </div>
      </main>

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {t.type === 'error' ? 'warning' : 'check_circle'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* NOTIFICADOR DE ACTUALIZACIONES AUTOMÁTICAS */}
      <UpdateNotifier />
    </div>
  );
}

export default function App() {
  const refreshCallbackRef = useRef(null);

  return (
    <AuthGuard onDataRefreshed={(count) => {
      if (refreshCallbackRef.current) refreshCallbackRef.current(count);
    }}>
      <AppContent onRegisterRefresh={(cb) => { refreshCallbackRef.current = cb; }} />
    </AuthGuard>
  );
}
