import React, { useState } from 'react';

const { ipcRenderer } = window.require('electron');

export default function LoginView({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim() || !password.trim()) {
      setError('Por favor ingrese correo electrónico y contraseña.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await ipcRenderer.invoke('auth:login', {
          email: email.trim(),
          password: password.trim()
        });

        if (res.ok && res.session) {
          onLoginSuccess(res.session);
        } else {
          setError(res.error || 'Credenciales inválidas.');
        }
      } else {
        const res = await ipcRenderer.invoke('auth:register', {
          email: email.trim(),
          password: password.trim()
        });

        if (res.ok) {
          if (res.session) {
            onLoginSuccess(res.session);
          } else {
            setMessage('Cuenta creada con éxito. Por favor verifica tu correo si la confirmación está activada, o intenta iniciar sesión.');
            setMode('login');
          }
        } else {
          setError(res.error || 'Error al crear la cuenta.');
        }
      }
    } catch (err) {
      setError('Error de comunicación con el servicio: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #131b2e 0%, #0b0f19 100%)',
      padding: '24px',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(59, 130, 246, 0.1)',
        padding: '36px 32px',
        boxSizing: 'border-box'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#fff' }}>
              local_shipping
            </span>
          </div>
          <h1 style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: '#f8fafc'
          }}>
            ViaControl
          </h1>
          <p style={{
            margin: '6px 0 0',
            fontSize: '13px',
            color: '#94a3b8',
            letterSpacing: '0.2px'
          }}>
            Gestión de Flota, Viajes & Sincronización en la Nube
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          background: 'rgba(15, 23, 42, 0.8)',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '24px',
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setMessage(''); }}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: mode === 'login' ? '#2563eb' : 'transparent',
              color: mode === 'login' ? '#fff' : '#94a3b8'
            }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); setMessage(''); }}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: mode === 'register' ? '#2563eb' : 'transparent',
              color: mode === 'register' ? '#fff' : '#94a3b8'
            }}
          >
            Crear Cuenta
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#ef4444' }}>error</span>
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#6ee7b7',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#10b981' }}>check_circle</span>
            <span>{message}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Correo Electrónico
            </label>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute',
                left: '12px',
                fontSize: '18px',
                color: '#64748b'
              }}>mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@viacontrol.com"
                required
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 40px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: mode === 'register' ? '18px' : '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Contraseña
            </label>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute',
                left: '12px',
                fontSize: '18px',
                color: '#64748b'
              }}>lock</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px 40px 12px 40px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <span
                className="material-symbols-outlined"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  fontSize: '18px',
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </div>
          </div>

          {mode === 'register' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Confirmar Contraseña
              </label>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
              }}>
                <span className="material-symbols-outlined" style={{
                  position: 'absolute',
                  left: '12px',
                  fontSize: '18px',
                  color: '#64748b'
                }}>lock_reset</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 12px 12px 40px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    color: '#f8fafc',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              transition: 'opacity 0.2s',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined spinning" style={{ fontSize: '18px' }}>sync</span>
                <span>Procesando...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  {mode === 'login' ? 'login' : 'person_add'}
                </span>
                <span>{mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>
              </>
            )}
          </button>
        </form>

        {/* Respaldo y sincronización */}
        <div style={{
          marginTop: '24px',
          paddingTop: '18px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          textAlign: 'center',
          fontSize: '12px',
          color: '#64748b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#10b981' }}>cloud_done</span>
            <span>Almacenamiento Local Seguro & Respaldo en la Nube</span>
          </div>
          <div style={{ marginTop: '4px', fontSize: '11px' }}>
            Tus datos se guardan en tu equipo y se sincronizan automáticamente para trabajar con o sin conexión.
          </div>
        </div>

      </div>
    </div>
  );
}
