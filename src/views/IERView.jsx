import React, { useState, useEffect, useCallback } from 'react';
const { ipcRenderer } = window.require('electron');

function formatGandolaLabel(g) {
  if (!g) return '';
  const placa = (g.placa || '').trim();
  const modelo = (g.modelo || '').trim();
  if (!modelo || modelo.toLowerCase() === placa.toLowerCase()) {
    if (/^\d+$/.test(placa)) return `Unidad N° ${placa}`;
    return placa;
  }
  return `${placa} (${modelo})`;
}

function IERView({ catalogos, showToast }) {
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filtros, setFiltros] = useState({
    busqueda: '',
    id_propietario: '',
    id_chofer: '',
    id_gandola: '',
    fecha_desde: '',
    fecha_hasta: '',
    entregado: '',   // '' | '1' | '0'
    pagado: '',      // '' | '1' | '0'
  });

  const cargarViajes = useCallback(async () => {
    setLoading(true);
    try {
      // Reutilizamos viajes:listar y filtramos entregado/pagado en frontend
      const res = await ipcRenderer.invoke('viajes:listar', {
        busqueda: filtros.busqueda,
        id_propietario: filtros.id_propietario,
        id_chofer: filtros.id_chofer,
        id_gandola: filtros.id_gandola,
        fecha_desde: filtros.fecha_desde,
        fecha_hasta: filtros.fecha_hasta,
      });
      if (res.ok) {
        let data = res.data;
        if (filtros.entregado !== '') {
          data = data.filter(v => String(v.entregado || 0) === filtros.entregado);
        }
        if (filtros.pagado !== '') {
          data = data.filter(v => String(v.pagado || 0) === filtros.pagado);
        }
        setViajes(data);
      } else {
        showToast(res.error, 'error');
      }
    } catch (err) {
      showToast('Error al cargar viajes: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => { cargarViajes(); }, [cargarViajes]);

  const actualizarEstado = async (id, campo, valorActual) => {
    const viaje = viajes.find(v => v.id === id);
    const nuevoValor = !valorActual;

    // Validación: no se puede pagar sin haber entregado
    if (campo === 'pagado' && nuevoValor && !viaje?.entregado) {
      showToast('No se puede marcar como Pagado sin haberlo Entregado primero.', 'error');
      return;
    }
    // Si se desmarca entregado y estaba pagado → también desmarcar pagado
    if (campo === 'entregado' && !nuevoValor && viaje?.pagado) {
      showToast('Se quitó también el estado Pagado ya que no puede estar pagado sin entregar.', 'error');
      setViajes(prev => prev.map(v =>
        v.id === id ? { ...v, entregado: 0, pagado: 0 } : v
      ));
      await ipcRenderer.invoke('ier:actualizarEstado', { id, campo: 'entregado', valor: false });
      await ipcRenderer.invoke('ier:actualizarEstado', { id, campo: 'pagado', valor: false });
      return;
    }

    // Actualizar localmente de inmediato (optimistic update)
    setViajes(prev => prev.map(v =>
      v.id === id ? { ...v, [campo]: nuevoValor ? 1 : 0 } : v
    ));
    const res = await ipcRenderer.invoke('ier:actualizarEstado', { id, campo, valor: nuevoValor });
    if (!res.ok) {
      showToast('Error al actualizar: ' + res.error, 'error');
      // Revertir
      setViajes(prev => prev.map(v =>
        v.id === id ? { ...v, [campo]: valorActual ? 1 : 0 } : v
      ));
    }
  };


  const getRowStyle = (v) => {
    const entregado = !!v.entregado;
    const pagado = !!v.pagado;
    if (entregado && pagado) {
      return { background: 'rgba(34, 197, 94, 0.28)', borderLeft: '4px solid #22c55e' };
    }
    if (pagado) {
      return { background: 'rgba(34, 197, 94, 0.28)', borderLeft: '4px solid #22c55e' };
    }
    if (entregado) {
      return { background: 'rgba(234, 179, 8, 0.28)', borderLeft: '4px solid #eab308' };
    }
    return {};
  };

  const handlePrint = () => {
    const printWin = window.open('', '_blank');
    const totalViajes = viajes.length;
    const totalEntregados = viajes.filter(v => v.entregado).length;
    const totalPagados = viajes.filter(v => v.pagado).length;

    const rows = viajes.map(v => {
      const entregado = !!v.entregado;
      const pagado = !!v.pagado;
      let rowBg = '';
      if (entregado && pagado) rowBg = '#a7f3d0';
      else if (pagado) rowBg = '#a7f3d0';
      else if (entregado) rowBg = '#fef08a';

      const gandola = (catalogos.gandolas || []).find(g => String(g.placa) === String(v.id_gandola));
      const gandolaLabel = gandola ? formatGandolaLabel(gandola) : (v.id_gandola || '');

      return `<tr style="background:${rowBg}">
        <td>${v.fecha}</td>
        <td>${v.contenedor || 'S/C'}</td>
        <td>${v.destino}<br><small>${v.origen}</small></td>
        <td>${v.id_chofer}</td>
        <td>${gandolaLabel}</td>
        <td style="text-align:center">${entregado ? '✅' : '⬜'}</td>
        <td style="text-align:center">${pagado ? '✅' : '⬜'}</td>
      </tr>`;
    }).join('');

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>IER – Índice de Entrega y Recaudación</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #111; margin: 24px; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .subtitle { color: #555; font-size: 11px; margin-bottom: 16px; }
    .stats { display: flex; gap: 24px; margin-bottom: 16px; font-size: 12px; }
    .stat { background: #f3f4f6; border-radius: 6px; padding: 6px 14px; }
    .stat strong { display: block; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e3a2f; color: #fff; padding: 6px 8px; text-align: center; font-size: 10px; text-transform: uppercase; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
    td small { color: #666; }
    @media print { body { margin: 8px; } }
  </style>
</head>
<body>
  <h1>📋 IER – Índice de Entrega y Recaudación</h1>
  <div class="subtitle">Generado el ${new Date().toLocaleDateString('es-VE', { dateStyle: 'long' })}</div>
  <div class="stats">
    <div class="stat"><strong>${totalViajes}</strong>Viajes en reporte</div>
    <div class="stat"><strong>${totalEntregados}</strong>Entregados</div>
    <div class="stat"><strong>${totalViajes - totalEntregados}</strong>No entregados</div>
    <div class="stat"><strong>${totalPagados}</strong>Pagados</div>
    <div class="stat"><strong>${totalViajes - totalPagados}</strong>Pendientes de cobro</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:center">Fecha</th>
        <th style="text-align:center">Contenedor</th>
        <th style="text-align:center">Ruta</th>
        <th style="text-align:center">Chofer</th>
        <th style="text-align:center">Gandola</th>
        <th style="text-align:center">Entregado</th>
        <th style="text-align:center">Pagado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 400);
  };

  const resetFiltros = () => setFiltros({
    busqueda: '', id_propietario: '', id_chofer: '', id_gandola: '',
    fecha_desde: '', fecha_hasta: '', entregado: '', pagado: ''
  });

  const totalViajes = viajes.length;
  const totalEntregados = viajes.filter(v => v.entregado).length;
  const totalPagados = viajes.filter(v => v.pagado).length;
  const totalNoEntregados = viajes.filter(v => !v.entregado).length;

  return (
    <div>
      {/* BARRA DE FILTROS */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* Búsqueda */}
          <div className="search-input-box" style={{ flex: '1 1 200px', minWidth: '160px' }}>
            <span className="search-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
            </span>
            <input
              type="text"
              className="form-input"
              placeholder="Contenedor, destino, chofer..."
              value={filtros.busqueda}
              onChange={e => setFiltros({ ...filtros, busqueda: e.target.value })}
            />
          </div>

          {/* Propietario */}
          <div style={{ minWidth: '160px' }}>
            <select className="form-select" value={filtros.id_propietario}
              onChange={e => setFiltros({ ...filtros, id_propietario: e.target.value })}>
              <option value="">Todos los propietarios</option>
              {(catalogos.propietarios || []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {/* Chofer */}
          <div style={{ minWidth: '150px' }}>
            <select className="form-select" value={filtros.id_chofer}
              onChange={e => setFiltros({ ...filtros, id_chofer: e.target.value })}>
              <option value="">Todos los choferes</option>
              {(catalogos.choferes || []).map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
            </select>
          </div>

          {/* Gandola */}
          <div style={{ minWidth: '150px' }}>
            <select className="form-select" value={filtros.id_gandola}
              onChange={e => setFiltros({ ...filtros, id_gandola: e.target.value })}>
              <option value="">Todas las gandolas</option>
              {(catalogos.gandolas || []).map(g => <option key={g.id} value={g.placa}>{formatGandolaLabel(g)}</option>)}
            </select>
          </div>

          {/* Fechas */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="date" className="form-input" value={filtros.fecha_desde}
              onChange={e => setFiltros({ ...filtros, fecha_desde: e.target.value })} title="Desde" />
            <span style={{ color: 'var(--on-surface-variant)' }}>a</span>
            <input type="date" className="form-input" value={filtros.fecha_hasta}
              onChange={e => setFiltros({ ...filtros, fecha_hasta: e.target.value })} title="Hasta" />
          </div>

          {/* Entregado */}
          <div style={{ minWidth: '130px' }}>
            <select className="form-select" value={filtros.entregado}
              onChange={e => setFiltros({ ...filtros, entregado: e.target.value })}>
              <option value="">Todos (entrega)</option>
              <option value="1">✅ Entregado</option>
              <option value="0">⬜ No entregado</option>
            </select>
          </div>

          {/* Pagado */}
          <div style={{ minWidth: '130px' }}>
            <select className="form-select" value={filtros.pagado}
              onChange={e => setFiltros({ ...filtros, pagado: e.target.value })}>
              <option value="">Todos (pago)</option>
              <option value="1">✅ Pagado</option>
              <option value="0">⬜ No pagado</option>
            </select>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={resetFiltros}>Restablecer</button>
          <button className="btn btn-primary btn-sm" onClick={handlePrint} title="Exportar a PDF / Imprimir">
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span>
            Imprimir
          </button>
        </div>
      </div>

      {/* RESUMEN RÁPIDO */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{
          background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.35)',
          borderRadius: '10px', padding: '10px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '110px'
        }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#60a5fa' }}>{totalViajes}</span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85 }}>Viajes</span>
        </div>
        <div style={{
          background: 'rgba(234, 179, 8, 0.14)', border: '1px solid rgba(234, 179, 8, 0.35)',
          borderRadius: '10px', padding: '10px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '110px'
        }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#facc15' }}>{totalEntregados}</span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85 }}>Entregados</span>
        </div>
        <div style={{
          background: 'rgba(148, 163, 184, 0.12)', border: '1px solid rgba(148, 163, 184, 0.30)',
          borderRadius: '10px', padding: '10px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '110px'
        }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#94a3b8' }}>{totalNoEntregados}</span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85 }}>No entregados</span>
        </div>
        <div style={{
          background: 'rgba(34, 197, 94, 0.14)', border: '1px solid rgba(34, 197, 94, 0.35)',
          borderRadius: '10px', padding: '10px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '110px'
        }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#4ade80' }}>{totalPagados}</span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85 }}>Pagados</span>
        </div>
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '10px', padding: '10px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '110px'
        }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#f87171' }}>{totalViajes - totalPagados}</span>
          <span style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85 }}>Pendientes cobro</span>
        </div>
      </div>


      {/* LEYENDA */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--on-surface-variant)' }}>
        <span>Leyenda:</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 14, height: 14, background: 'rgba(234,179,8,0.38)', border: '2px solid #eab308', borderRadius: 3, display: 'inline-block' }} />
          Entregado (pendiente cobro)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 14, height: 14, background: 'rgba(34,197,94,0.38)', border: '2px solid #22c55e', borderRadius: 3, display: 'inline-block' }} />
          Entregado y Pagado
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 14, height: 14, background: 'var(--surface-variant)', border: '2px solid var(--outline)', borderRadius: 3, display: 'inline-block' }} />
          Pendiente
        </span>
      </div>

      {/* TABLA */}
      <div className="table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Fecha</th>
              <th style={{ textAlign: 'center' }}>Contenedor</th>
              <th style={{ textAlign: 'center' }}>Ruta</th>
              <th style={{ textAlign: 'center' }}>Chofer</th>
              <th style={{ textAlign: 'center' }}>Gandola</th>
              <th style={{ textAlign: 'center', minWidth: '100px' }}>Entregado</th>
              <th style={{ textAlign: 'center', minWidth: '100px' }}>Pagado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--primary)' }}>
                  <span className="material-symbols-outlined spinning" style={{ fontSize: '24px', verticalAlign: 'middle', marginRight: '8px' }}>sync</span>
                  Cargando...
                </td>
              </tr>
            ) : viajes.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--on-surface-variant)' }}>
                  No se encontraron viajes con los filtros seleccionados.
                </td>
              </tr>
            ) : viajes.map(v => {
              const entregado = !!v.entregado;
              const pagado = !!v.pagado;
              const foundGandola = (catalogos.gandolas || []).find(g => String(g.placa) === String(v.id_gandola));
              const gandolaDisplay = foundGandola ? formatGandolaLabel(foundGandola) : (v.id_gandola || '');

              return (
                <tr key={v.id} style={getRowStyle(v)}>
                  <td className="mono" style={{ textAlign: 'center', fontWeight: 600 }}>
                    {v.fecha}
                  </td>
                  <td className="mono" style={{ textAlign: 'center', fontWeight: 600 }}>
                    {v.contenedor || 'S/C'}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{v.destino}</div>
                    <div style={{ fontSize: '11px', color: 'var(--on-surface)', opacity: 0.85 }}>Desde: {v.origen}</div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{v.id_chofer}</td>
                  <td className="mono" style={{ textAlign: 'center', fontWeight: 600 }}>
                    {gandolaDisplay}
                  </td>

                  {/* Toggle ENTREGADO */}
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => actualizarEstado(v.id, 'entregado', entregado)}
                      title={entregado ? 'Marcar como No Entregado' : 'Marcar como Entregado'}
                      style={{
                        border: 'none', cursor: 'pointer', borderRadius: '8px',
                        padding: '5px 12px', fontWeight: 600, fontSize: '13px',
                        transition: 'all 0.15s ease',
                        background: 'transparent',
                        color: 'var(--on-surface)',
                      }}
                    >
                      {entregado ? '✓ Sí' : '— No'}
                    </button>
                  </td>

                  {/* Toggle PAGADO */}
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => actualizarEstado(v.id, 'pagado', pagado)}
                      title={pagado ? 'Marcar como No Pagado' : 'Marcar como Pagado'}
                      style={{
                        border: 'none', cursor: 'pointer', borderRadius: '8px',
                        padding: '5px 12px', fontWeight: 600, fontSize: '13px',
                        transition: 'all 0.15s ease',
                        background: 'transparent',
                        color: 'var(--on-surface)',
                      }}
                    >
                      {pagado ? '✓ Sí' : '— No'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default IERView;
