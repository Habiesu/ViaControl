import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatUSD } from '../../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

const POR_PAGINA = 50;

const ESTADOS = {
  nueva: { texto: 'Nueva', icono: 'add_circle', clase: 'badge-emerald' },
  cambia: { texto: 'Cambia', icono: 'sync_alt', clase: 'badge-amber' },
  igual: { texto: 'Sin cambios', icono: 'check', clase: 'badge-gray' },
  error: { texto: 'Error', icono: 'error', clase: 'badge-rose' }
};

const FILTROS = [
  { id: 'todas', texto: 'Todas' },
  { id: 'nueva', texto: 'Nuevas' },
  { id: 'cambia', texto: 'Cambian' },
  { id: 'igual', texto: 'Sin cambios' },
  { id: 'error', texto: 'Errores' }
];

/** Solo se aplican nuevas y cambios; las de error y las que no cambian nada no se pueden marcar. */
function seleccionable(a) {
  return a && (a.estado === 'nueva' || a.estado === 'cambia');
}
function incluida(fila, a) {
  if (!seleccionable(a)) return false;
  return fila.incluir !== undefined ? fila.incluir : true;
}

function ImportVerificacionRutas({ filasIniciales, nombreArchivo, onCambiarArchivo, onCancelar, onImportado, showToast }) {
  const [filas, setFilas] = useState(() => filasIniciales.map(f => ({ ...f, datos: { ...f.datos }, incluir: undefined })));
  const [analisis, setAnalisis] = useState([]);
  const [analizando, setAnalizando] = useState(true);
  const [errorAnalisis, setErrorAnalisis] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const versionRef = useRef(0);

  const claveAnalisis = useMemo(() => JSON.stringify(filas.map(f => f.datos)), [filas]);

  useEffect(() => {
    const version = ++versionRef.current;
    setAnalizando(true);
    const t = setTimeout(async () => {
      try {
        const res = await ipcRenderer.invoke('import:rutasAnalizar', {
          filas: filas.map(f => ({ hoja: f.hoja, filaExcel: f.filaExcel, datos: f.datos }))
        });
        if (version !== versionRef.current) return;
        if (res.ok) { setAnalisis(res.analisis); setErrorAnalisis(''); }
        else setErrorAnalisis(res.error || 'No se pudieron validar las rutas');
      } catch (err) {
        if (version === versionRef.current) setErrorAnalisis(err.message);
      } finally {
        if (version === versionRef.current) setAnalizando(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAnalisis]);

  const editar = (idx, campo, valor) => {
    setFilas(prev => prev.map((f, i) => (i === idx ? { ...f, datos: { ...f.datos, [campo]: valor } } : f)));
  };
  const setIncluir = (idx, valor) => setFilas(prev => prev.map((f, i) => (i === idx ? { ...f, incluir: valor } : f)));
  const setIncluirTodas = (valor) => setFilas(prev => prev.map(f => ({ ...f, incluir: valor })));

  const listo = analisis.length === filas.length && !analizando && !errorAnalisis;

  const resumen = useMemo(() => {
    const r = { total: filas.length, nueva: 0, cambia: 0, igual: 0, error: 0, crear: 0, actualizar: 0 };
    filas.forEach((f, i) => {
      const a = analisis[i];
      if (!a) return;
      r[a.estado]++;
      if (incluida(f, a)) r[a.estado === 'nueva' ? 'crear' : 'actualizar']++;
    });
    return r;
  }, [filas, analisis]);

  const indicesVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const res = [];
    filas.forEach((f, i) => {
      const a = analisis[i];
      if (filtro !== 'todas' && (!a || a.estado !== filtro)) return;
      if (q && !`${f.datos.origen} ${f.datos.destino} ${f.datos.precio}`.toLowerCase().includes(q)) return;
      res.push(i);
    });
    return res;
  }, [filas, analisis, filtro, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(indicesVisibles.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const indicesPagina = indicesVisibles.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);
  useEffect(() => { setPagina(0); }, [filtro, busqueda]);

  const confirmar = async () => {
    const seleccion = filas.filter((f, i) => incluida(f, analisis[i]));
    if (seleccion.length === 0) { showToast('No hay rutas seleccionadas', 'error'); return; }
    setConfirmando(true);
    try {
      const res = await ipcRenderer.invoke('import:rutasConfirmar', {
        filas: seleccion.map(f => ({ hoja: f.hoja, filaExcel: f.filaExcel, datos: f.datos }))
      });
      if (!res.ok) { showToast(res.error, 'error'); return; }
      onImportado(res);
    } catch (err) {
      showToast('Error al importar: ' + err.message, 'error');
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <div className="imp-verificacion">
      <div className="imp-cabecera">
        <div className="imp-archivo">
          <span className="material-symbols-outlined">description</span>
          <span><strong>{filas.length}</strong> rutas en <em>{nombreArchivo}</em></span>
          <button className="btn btn-ghost btn-sm" onClick={onCambiarArchivo} disabled={confirmando}>
            <span className="material-symbols-outlined">swap_horiz</span> Cambiar archivo
          </button>
          {analizando && (
            <span className="imp-validando">
              <span className="material-symbols-outlined imp-girando">progress_activity</span> Comparando…
            </span>
          )}
        </div>
        <div className="imp-filtros">
          {FILTROS.map(fl => (
            <button
              key={fl.id}
              className={`imp-filtro imp-filtro-${fl.id === 'nueva' ? 'lista' : fl.id === 'cambia' ? 'aviso' : fl.id} ${filtro === fl.id ? 'activo' : ''}`}
              onClick={() => setFiltro(fl.id)}
            >
              {fl.texto} <span className="imp-filtro-n">{fl.id === 'todas' ? resumen.total : resumen[fl.id]}</span>
            </button>
          ))}
          <input className="form-input imp-buscar" placeholder="Buscar origen o destino…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <div className="imp-masivas">
          <span>Selección:</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setIncluirTodas(true)}>Marcar todas</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setIncluirTodas(false)}>Desmarcar todas</button>
        </div>
      </div>

      {errorAnalisis && (
        <div className="imp-msg imp-msg-error" style={{ margin: '8px 0' }}>
          <span className="material-symbols-outlined">error</span>
          <span>No se pudieron validar las rutas: {errorAnalisis}</span>
        </div>
      )}

      <div className="imp-tabla-wrap">
        <table className="imp-tabla">
          <thead>
            <tr>
              <th className="imp-col-check"></th>
              <th>Hoja · fila</th>
              <th className="imp-col-estado">Estado</th>
              <th style={{ minWidth: 140 }}>Origen</th>
              <th style={{ minWidth: 170 }}>Destino</th>
              <th style={{ minWidth: 110, textAlign: 'right' }}>Precio actual</th>
              <th style={{ minWidth: 110 }}>Precio nuevo</th>
              <th style={{ minWidth: 100, textAlign: 'right' }}>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {indicesPagina.length === 0 && (
              <tr><td colSpan={8} className="imp-vacio">{analisis.length === 0 ? 'Comparando rutas…' : 'No hay rutas con este filtro.'}</td></tr>
            )}
            {indicesPagina.map(idx => {
              const f = filas[idx];
              const a = analisis[idx];
              const estado = a ? ESTADOS[a.estado] : null;
              const marcada = incluida(f, a);
              const atenuada = a && !marcada && a.estado !== 'error';
              const dif = a && a.anterior && a.estado !== 'error' ? a.ruta.precio_base - a.anterior.precio_base : null;
              return (
                <React.Fragment key={idx}>
                  <tr className={`imp-fila ${atenuada ? 'imp-fila-excluida' : ''}`}>
                    <td className="imp-col-check">
                      <input
                        type="checkbox"
                        checked={marcada}
                        disabled={!seleccionable(a) || confirmando}
                        title={a && a.estado === 'igual' ? 'No cambia nada' : a && a.estado === 'error' ? 'Corrige el error para poder importarla' : 'Aplicar esta ruta'}
                        onChange={e => setIncluir(idx, e.target.checked)}
                      />
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap', color: 'var(--on-surface-variant)' }}>{f.hoja} · {f.filaExcel}</td>
                    <td className="imp-col-estado">
                      {estado && <span className={`badge ${estado.clase}`}><span className="material-symbols-outlined">{estado.icono}</span>{estado.texto}</span>}
                    </td>
                    <td><input className="form-input imp-input" value={f.datos.origen} disabled={confirmando} onChange={e => editar(idx, 'origen', e.target.value)} /></td>
                    <td><input className="form-input imp-input" value={f.datos.destino} disabled={confirmando} onChange={e => editar(idx, 'destino', e.target.value)} /></td>
                    <td className="mono imp-num">
                      {a && a.anterior ? formatUSD(a.anterior.precio_base) : '—'}
                      {a && a.anterior && !a.anterior.activo && <div style={{ fontSize: 11, color: 'var(--secondary)' }}>inactiva: se reactivará</div>}
                    </td>
                    <td>
                      <input
                        className={`form-input imp-input imp-num ${a && a.estado === 'error' ? 'imp-celda-error' : a && a.estado === 'cambia' ? 'imp-celda-aviso' : ''}`}
                        value={f.datos.precio}
                        inputMode="decimal"
                        disabled={confirmando}
                        onChange={e => editar(idx, 'precio', e.target.value)}
                      />
                    </td>
                    <td className={`mono imp-num ${dif < 0 ? 'imp-negativo' : ''}`} style={{ color: dif > 0 ? 'var(--secondary)' : undefined }}>
                      {dif === null || dif === 0 ? '—' : (dif > 0 ? '+' : '') + formatUSD(dif).replace('$-', '-$')}
                    </td>
                  </tr>
                  {a && a.errores.length > 0 && (
                    <tr className="imp-fila-mensajes">
                      <td></td>
                      <td colSpan={7}>
                        {a.errores.map((e, k) => (
                          <div key={k} className="imp-msg imp-msg-error"><span className="material-symbols-outlined">error</span><span>{e}</span></div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="imp-paginacion">
          <button className="btn btn-ghost btn-sm" disabled={paginaActual === 0} onClick={() => setPagina(paginaActual - 1)}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span>Página {paginaActual + 1} de {totalPaginas} · {indicesVisibles.length} rutas</span>
          <button className="btn btn-ghost btn-sm" disabled={paginaActual >= totalPaginas - 1} onClick={() => setPagina(paginaActual + 1)}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      )}

      <div className="imp-pie">
        <div className="imp-pie-resumen">
          Se crearán <strong>{resumen.crear}</strong> rutas y se actualizarán <strong>{resumen.actualizar}</strong> precios
          {resumen.igual > 0 && <span style={{ color: 'var(--on-surface-variant)' }}> · {resumen.igual} sin cambios</span>}
          {resumen.error > 0 && <span className="imp-pie-errores"> · {resumen.error} con errores no se importarán</span>}
        </div>
        <div className="imp-pie-botones">
          <button className="btn btn-secondary" onClick={onCancelar} disabled={confirmando}>Cancelar</button>
          <button className="btn btn-primary" disabled={!listo || confirmando || resumen.crear + resumen.actualizar === 0} onClick={confirmar}>
            {confirmando
              ? <><span className="material-symbols-outlined imp-girando">progress_activity</span> Guardando…</>
              : <><span className="material-symbols-outlined">upload</span> Aplicar {resumen.crear + resumen.actualizar} cambio{resumen.crear + resumen.actualizar === 1 ? '' : 's'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportVerificacionRutas;
