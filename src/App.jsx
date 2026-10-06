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
  const { user, logout, syncStatus, triggerSync } = useAuth();
  const [currentTab, setCurrentTab] = useState('nuevo-viaje');
  const [catalogos, setCatalogos] = useState({
    rutas: [], origenes: [], choferes: [], gandolas: [], propietarios: [],
  });
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState('light');
  const [appVersion, setAppVersion] = useState('');

  // Cargar tema guardado al iniciar
  useEffect(() => {
    ipcRenderer.invoke('theme:get').then(saved => {
      setTheme(saved || 'light');
    }).catch(() => setTheme('light'));
  }, []);

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
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
    ipcRenderer.invoke('ajustes:obtenerVersion').then(res => {
      if (res && res.ok && res.version) setAppVersion(res.version);
    }).catch(() => {});

    if (onRegisterRefresh) {
      onRegisterRefresh((count) => {
        showToast(`Sincronización: ${count} registro(s) actualizados desde la nube`);
        loadCatalogos();
      });
    }
  }, []);

  const tab = TABS[currentTab];
  const viewProps = { catalogos, showToast };

  return (
    <div className={`app-container${theme === 'light' ? ' light-mode' : ''}`}>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-icon-wrap">
            <span className="material-symbols-outlined">local_shipping</span>
          </div>
          <div>
            <div className="brand-title">ViaControl</div>
            <div className="brand-subtitle">Telematics Core</div>
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
                  onClick={() => setCurrentTab(key)}
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
            onClick={() => setCurrentTab('ajustes')}
            style={{ marginBottom: '8px' }}
          >
            <span className="material-symbols-outlined">settings</span>
            <span>Ajustes</span>
          </div>

          {/* ESTADO DE SINCRONIZACIÓN SUPABASE */}
          <div
            className="status-chip"
            onClick={triggerSync}
            style={{ cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none' }}
            title={syncStatus.lastSync ? `Última sincronización: ${new Date(syncStatus.lastSync).toLocaleTimeString()} (Clic para sincronizar ahora)` : 'Clic para sincronizar con la nube'}
          >
            <span
              className={`material-symbols-outlined ${syncStatus.syncing ? 'spinning' : ''}`}
              style={{
                fontSize: '16px',
                color: syncStatus.syncing ? '#3b82f6' : (syncStatus.error ? '#f59e0b' : '#10b981')
              }}
            >
              {syncStatus.syncing ? 'sync' : (syncStatus.error ? 'cloud_off' : 'cloud_done')}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 500 }}>
              {syncStatus.syncing
                ? 'Sincronizando...'
                : (syncStatus.pendingCount > 0
                    ? `${syncStatus.pendingCount} pendientes`
                    : 'Nube al día')}
            </span>
            <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: '11px', opacity: 0.8 }}>
              {appVersion ? `v${appVersion}` : ''}
            </span>
          </div>

          {/* PERFIL DE USUARIO Y LOGOUT */}
          <div className="status-chip" style={{ justifyContent: 'space-between', padding: '6px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#3b82f6' }}>person</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  maxWidth: '120px'
                }}
                title={user?.email || 'Usuario'}
              >
                {user?.email?.split('@')[0] || 'Operador'}
              </span>
            </div>
            <button
              onClick={logout}
              title="Cerrar Sesión"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px 4px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span>
            </button>
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
            <h1>{tab?.label}</h1>
          </div>
          <div className="topbar-actions">
            {/* BOTÓN FORZAR SINCRONIZACIÓN */}
            <button
              className="btn btn-secondary btn-sm"
              onClick={triggerSync}
              disabled={syncStatus.syncing}
              title={syncStatus.lastSync ? `Última sincronización: ${new Date(syncStatus.lastSync).toLocaleTimeString()}` : 'Sincronizar con la nube'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span
                className={`material-symbols-outlined ${syncStatus.syncing ? 'spinning' : ''}`}
                style={{ fontSize: '16px', color: syncStatus.syncing ? '#3b82f6' : 'inherit' }}
              >
                sync
              </span>
              <span>{syncStatus.syncing ? 'Sincronizando' : 'Sincronizar'}</span>
            </button>

            <button
              id="theme-toggle"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a Tema Claro' : 'Cambiar a Tema Oscuro'}
            >
              <span className="material-symbols-outlined">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
            </button>
            {currentTab !== 'nuevo-viaje' && (
              <button className="btn btn-primary btn-sm" onClick={() => setCurrentTab('nuevo-viaje')}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                Nuevo Viaje
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
            {currentTab === 'liquidacion' && <LiquidacionSemanalView {...viewProps} />}
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
            {currentTab === 'ajustes' && <AjustesView {...viewProps} />}
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
