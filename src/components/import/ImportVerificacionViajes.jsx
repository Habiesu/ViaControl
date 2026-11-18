import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatUSD } from '../../utils/helpers.js';
const { ipcRenderer } = window.require('electron');

const POR_PAGINA = 50;

const COLUMNAS = [
  { campo: 'fecha', titulo: 'Fecha', ancho: 112, tipo: 'date' },
  { campo: 'origen', titulo: 'Origen', ancho: 130 },
  { campo: 'destino', titulo: 'Destino', ancho: 130 },
  { campo: 'gandola', titulo: 'Gandola', ancho: 110, lista: 'imp-gandolas' },
  { campo: 'chofer', titulo: 'Chofer', ancho: 150, lista: 'imp-choferes' },
  { campo: 'propietario', titulo: 'Propietario', ancho: 150, lista: 'imp-propietarios', placeholder: 'Automático' },
  { campo: 'contenedor', titulo: 'Contenedor', ancho: 120 },
  { campo: 'flete', titulo: 'Flete', ancho: 90, numero: true },
  { campo: 'gasoil', titulo: 'Gasoil', ancho: 80, numero: true },
  { campo: 'peajes', titulo: 'Peajes', ancho: 80, numero: true },
  { campo: 'viaticos', titulo: 'Viáticos', ancho: 80, numero: true },
  { campo: 'pago_chofer', titulo: 'Pago chofer', ancho: 90, numero: true },
  { campo: 'notas', titulo: 'Notas', ancho: 150 }
];

const ESTADOS = {
  lista: { texto: 'Lista', icono: 'check_circle', clase: 'badge-emerald' },
  aviso: { texto: 'Aviso', icono: 'warning', clase: 'badge-amber' },
  error: { texto: 'Error', icono: 'error', clase: 'badge-rose' },
  duplicado: { texto: 'Duplicada', icono: 'content_copy', clase: 'badge-gray' }
};

const FILTROS = [
  { id: 'todas', texto: 'Todas' },
  { id: 'lista', texto: 'Listas' },
  { id: 'aviso', texto: 'Avisos' },
  { id: 'error', texto: 'Errores' },
  { id: 'duplicado', texto: 'Duplicadas' },
  { id: 'excluidas', texto: 'Descartadas' }
];

function normalizar(campo, v) {
  const s = String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (campo === 'gandola') return s.toUpperCase().replace(/[\s\-_.]/g, '');
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** ¿Se importará esta fila? Las de error nunca; las duplicadas solo si el usuario las marca. */
function incluida(fila, analisis) {
  if (!analisis || analisis.estado === 'error') return false;
  if (fila.incluir !== undefined) return fila.incluir;
  return analisis.estado !== 'duplicado';
}

function ImportVerificacionViajes({ filasIniciales, nombreArchivo, onCambiarArchivo, onCancelar, onImportado, showToast }) {
  const [filas, setFilas] = useState(() =>
    filasIniciales.map(f => ({ fila: f.fila, datos: { ...f.datos }, crear: {}, incluir: undefined }))
  );
  const [analisis, setAnalisis] = useState([]);
  const [opciones, setOpciones] = useState({ choferes: [], gandolas: [], propietarios: [] });
  const [analizando, setAnalizando] = useState(true);
  const [errorAnalisis, setErrorAnalisis] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const versionRef = useRef(0);

  // Solo los datos y las decisiones de "crear" afectan al análisis (marcar/desmarcar no)
  const claveAnalisis = useMemo(
    () => JSON.stringify(filas.map(f => [f.datos, f.crear])),
    [filas]
  );

  useEffect(() => {
    const version = ++versionRef.current;
    setAnalizando(true);
    const t = setTimeout(async () => {
      try {
        const res = await ipcRenderer.invoke('import:analizarViajes', {
          filas: filas.map(f => ({ fila: f.fila, datos: f.datos, crear: f.crear }))
        });
        if (version !== versionRef.current) return;
        if (res.ok) {
          setAnalisis(res.analisis);
          setOpciones(res.opciones);
          setErrorAnalisis('');
        } else {
          setErrorAnalisis(res.error || 'No se pudieron validar las filas');
        }
      } catch (err) {
        if (version === versionRef.current) setErrorAnalisis(err.message);
      } finally {
        if (version === versionRef.current) setAnalizando(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAnalisis]);

  // ─── Acciones sobre filas ────────────────────────────────────────────────
  const editar = (idx, campo, valor) => {
    setFilas(prev => prev.map((f, i) => {
      if (i !== idx) return f;
      const crear = { ...f.crear };
      if (campo === 'chofer' || campo === 'gandola') delete crear[campo];
      return { ...f, datos: { ...f.datos, [campo]: valor }, crear };
    }));
  };

  /** Cambia `campo` en todas las filas cuyo valor coincide con `valorActual` (sin importar mayúsculas ni tildes). */
  const aplicarATodas = (campo, valorActual, nuevo) => {
    const objetivo = normalizar(campo, valorActual);
    const n = contarIguales(campo, valorActual);
    setFilas(prev => prev.map(f => {
      if (normalizar(campo, f.datos[campo]) !== objetivo) return f;
      const crear = { ...f.crear };
      delete crear[campo];
      return { ...f, datos: { ...f.datos, [campo]: nuevo }, crear };
    }));
    showToast(`Cambiado en ${n} fila(s)`);
  };

  /** Marca para crear el chofer/gandola de la fila `idx`, o de todas las filas con el mismo valor si idx es null. */
  const marcarCrear = (campo, valor, idx) => {
    const objetivo = normalizar(campo, valor);
    setFilas(prev => prev.map((f, i) => {
      const coincide = idx === null ? normalizar(campo, f.datos[campo]) === objetivo : i === idx;
      return coincide ? { ...f, crear: { ...f.crear, [campo]: true } } : f;
    }));
  };

  const contarIguales = (campo, valor) => {
    const objetivo = normalizar(campo, valor);
    return filas.reduce((n, f) => n + (normalizar(campo, f.datos[campo]) === objetivo ? 1 : 0), 0);
  };

  const setIncluir = (idx, valor) => {
    setFilas(prev => prev.map((f, i) => (i === idx ? { ...f, incluir: valor } : f)));
  };

  const setIncluirVarias = (predicado, valor) => {
    setFilas(prev => prev.map((f, i) => (predicado(f, analisis[i]) ? { ...f, incluir: valor } : f)));
  };

  // ─── Derivados ────────────────────────────────────────────────────────────
  const listo = analisis.length === filas.length && !analizando && !errorAnalisis;

  const resumen = useMemo(() => {
    const r = { total: filas.length, lista: 0, aviso: 0, error: 0, duplicado: 0, seleccionadas: 0, totalFletes: 0, excluidas: 0 };
    filas.forEach((f, i) => {
      const a = analisis[i];
      if (!a) return;
      r[a.estado]++;
      if (incluida(f, a)) {
        r.seleccionadas++;
        r.totalFletes += a.viaje.precio_viaje || 0;
      } else if (a.estado !== 'error') {
        r.excluidas++;
      }
    });
    return r;
  }, [filas, analisis]);

  const indicesVisibles = useMemo(() => {
    const q = normalizar('texto', busqueda);
    const res = [];
    filas.forEach((f, i) => {
      const a = analisis[i];
      if (filtro === 'excluidas') {
        if (!a || a.estado === 'error' || incluida(f, a)) return;
      } else if (filtro !== 'todas' && (!a || a.estado !== filtro)) {
        return;
      }
      if (q) {
        const textoFila = normalizar('texto', Object.values(f.datos).join(' ') + ' ' + f.fila);
        if (!textoFila.includes(q)) return;
      }
      res.push(i);
    });
    return res;
  }, [filas, analisis, filtro, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(indicesVisibles.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const indicesPagina = indicesVisibles.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);

  useEffect(() => { setPagina(0); }, [filtro, busqueda]);

  // ─── Confirmar ────────────────────────────────────────────────────────────
  const confirmar = async () => {
    const seleccion = filas.filter((f, i) => incluida(f, analisis[i]));
    if (seleccion.length === 0) {
      showToast('No hay filas seleccionadas para importar', 'error');
      return;
    }
    setConfirmando(true);
    try {
      const res = await ipcRenderer.invoke('import:confirmarViajes', {
        filas: seleccion.map(f => ({ fila: f.fila, datos: f.datos, crear: f.crear }))
      });
      if (!res.ok) {
        showToast(res.error, 'error');
        return;
      }
      const descartadas = filas
        .map((f, i) => ({ f, a: analisis[i] }))
        .filter(({ f, a }) => !incluida(f, a))
        .map(({ f, a }) => ({
          fila: f.fila,
          motivo: a.estado === 'error'
            ? a.errores.map(e => e.mensaje).join('; ')
            : a.estado === 'duplicado' ? a.duplicado.mensaje : 'Descartada por el usuario'
        }));
      onImportado({ ...res, descartadas });
    } catch (err) {
      showToast('Error al importar: ' + err.message, 'error');
    } finally {
      setConfirmando(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const renderMensajes = (idx, a) => {
    const f = filas[idx];
    const items = [];

    a.errores.forEach((e, k) => {
      const sugerencias = (a.sugerencias && a.sugerencias[e.campo]) || [];
      const valor = f.datos[e.campo];
      const iguales = e.tipo === 'no_existe' ? contarIguales(e.campo, valor) : 0;
      items.push(
        <div key={'e' + k} className="imp-msg imp-msg-error">
          <span className="material-symbols-outlined">error</span>
          <span>{e.mensaje}</span>
          {e.tipo === 'no_existe' && (
            <span className="imp-acciones">
              {sugerencias.map(s => (
                <button key={s} className="btn btn-secondary btn-sm" onClick={() => editar(idx, e.campo, s)}>
                  Usar «{s}»
                </button>
              ))}
              {sugerencias[0] && iguales > 1 && (
                <button className="btn btn-secondary btn-sm" onClick={() => aplicarATodas(e.campo, valor, sugerencias[0])}>
                  Usar «{sugerencias[0]}» en las {iguales} filas
                </button>
              )}
              {(e.campo === 'chofer' || e.campo === 'gandola') && (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => marcarCrear(e.campo, valor, idx)}
                  >
                    <span className="material-symbols-outlined">add</span>
                    Crear {e.campo === 'chofer' ? 'chofer' : 'gandola'}
                  </button>
                  {iguales > 1 && (
                    <button className="btn btn-secondary btn-sm" onClick={() => marcarCrear(e.campo, valor, null)}>
                      Crear y usar en las {iguales} filas
                    </button>
                  )}
                </>
              )}
              {e.campo === 'propietario' && (
                <button className="btn btn-secondary btn-sm" onClick={() => editar(idx, 'propietario', '')}>
                  Usar el automático
                </button>
              )}
            </span>
          )}
        </div>
      );
    });

    if (a.duplicado) {
      items.push(
        <div key="dup" className="imp-msg imp-msg-dup">
          <span className="material-symbols-outlined">content_copy</span>
          <span>{a.duplicado.mensaje}. {incluida(f, a) ? 'Se importará igualmente.' : 'No se importará salvo que la marques.'}</span>
        </div>
      );
    }

    a.avisos.forEach((w, k) => {
      const esCreacion = (w.campo === 'chofer' || w.campo === 'gandola') && f.crear[w.campo];
      items.push(
        <div key={'w' + k} className="imp-msg imp-msg-aviso">
          <span className="material-symbols-outlined">warning</span>
          <span>{w.mensaje}</span>
          {esCreacion && (
            <span className="imp-acciones">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setFilas(prev => prev.map((x, i) => {
                  if (i !== idx) return x;
                  const crear = { ...x.crear };
                  delete crear[w.campo];
                  return { ...x, crear };
                }))}
              >
                No crear
              </button>
            </span>
          )}
        </div>
      );
    });

    return items;
  };

  const camposConProblema = (a, tipo) => new Set((a ? a[tipo] : []).map(x => x.campo));

  return (
    <div className="imp-verificacion">
      <datalist id="imp-choferes">{opciones.choferes.map(o => <option key={o} value={o} />)}</datalist>
      <datalist id="imp-gandolas">{opciones.gandolas.map(o => <option key={o} value={o} />)}</datalist>
      <datalist id="imp-propietarios">{opciones.propietarios.map(o => <option key={o} value={o} />)}</datalist>

      {/* Cabecera: archivo y resumen */}
      <div className="imp-cabecera">
        <div className="imp-archivo">
          <span className="material-symbols-outlined">description</span>
          <span><strong>{filas.length}</strong> filas en <em>{nombreArchivo}</em></span>
          <button className="btn btn-ghost btn-sm" onClick={onCambiarArchivo} disabled={confirmando}>
            <span className="material-symbols-outlined">swap_horiz</span> Cambiar archivo
          </button>
          {analizando && (
            <span className="imp-validando">
              <span className="material-symbols-outlined imp-girando">progress_activity</span> Validando…
            </span>
          )}
        </div>

        <div className="imp-filtros">
          {FILTROS.map(fl => {
            const n = fl.id === 'todas' ? resumen.total : fl.id === 'excluidas' ? resumen.excluidas : resumen[fl.id];
            return (
              <button
                key={fl.id}
                className={`imp-filtro imp-filtro-${fl.id} ${filtro === fl.id ? 'activo' : ''}`}
                onClick={() => setFiltro(fl.id)}
              >
                {fl.texto} <span className="imp-filtro-n">{n}</span>
              </button>
            );
          })}
          <input
            className="form-input imp-buscar"
            placeholder="Buscar en las filas…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <div className="imp-masivas">
          <span>Selección:</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setIncluirVarias(() => true, true)}>Marcar todas</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setIncluirVarias(() => true, false)}>Desmarcar todas</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setIncluirVarias((f, a) => a && a.estado === 'duplicado', false)}>Descartar duplicadas</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setIncluirVarias(() => true, undefined)}>Restablecer</button>
        </div>
      </div>

      {errorAnalisis && (
        <div className="imp-msg imp-msg-error" style={{ margin: '8px 0' }}>
          <span className="material-symbols-outlined">error</span>
          <span>No se pudieron validar las filas: {errorAnalisis}</span>
        </div>
      )}

      {/* Tabla */}
      <div className="imp-tabla-wrap">
        <table className="imp-tabla">
          <thead>
            <tr>
              <th className="imp-col-check"></th>
              <th className="imp-col-fila">Fila</th>
              <th className="imp-col-estado">Estado</th>
              {COLUMNAS.map(c => <th key={c.campo} style={{ minWidth: c.ancho }}>{c.titulo}</th>)}
              <th style={{ minWidth: 90 }}>Ganancia</th>
            </tr>
          </thead>
          <tbody>
            {indicesPagina.length === 0 && (
              <tr><td colSpan={COLUMNAS.length + 4} className="imp-vacio">
                {analisis.length === 0 ? 'Validando filas…' : 'No hay filas con este filtro.'}
              </td></tr>
            )}
            {indicesPagina.map(idx => {
              const f = filas[idx];
              const a = analisis[idx];
              const estado = a ? ESTADOS[a.estado] : null;
              const conError = camposConProblema(a, 'errores');
              const conAviso = camposConProblema(a, 'avisos');
              const marcada = incluida(f, a);
              // Las filas con error no se atenúan: son las que necesitan atención
              const atenuada = !marcada && a && a.estado !== 'error';
              const mensajes = a ? renderMensajes(idx, a) : [];
              return (
                <React.Fragment key={idx}>
                  <tr className={`imp-fila ${atenuada ? 'imp-fila-excluida' : ''} ${a ? 'imp-fila-' + a.estado : ''}`}>
                    <td className="imp-col-check">
                      <input
                        type="checkbox"
                        checked={marcada}
                        disabled={!a || a.estado === 'error'}
                        title={a && a.estado === 'error' ? 'Corrige los errores para poder importarla' : 'Importar esta fila'}
                        onChange={e => setIncluir(idx, e.target.checked)}
                      />
                    </td>
                    <td className="imp-col-fila mono">{f.fila}</td>
                    <td className="imp-col-estado">
                      {estado && (
                        <span className={`badge ${estado.clase}`}>
                          <span className="material-symbols-outlined">{estado.icono}</span>{estado.texto}
                        </span>
                      )}
                    </td>
                    {COLUMNAS.map(c => {
                      const valor = f.datos[c.campo] ?? '';
                      const clase = conError.has(c.campo) ? 'imp-celda-error' : conAviso.has(c.campo) ? 'imp-celda-aviso' : '';
                      // Para la fecha: selector de fecha si el valor ya es válido, texto si hay que corregirlo
                      const tipo = c.tipo === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? 'date' : 'text';
                      let placeholder = c.placeholder || '';
                      if (a && c.campo === 'propietario' && !valor && a.resuelto.propietario) placeholder = a.resuelto.propietario.nombre + ' (auto)';
                      if (a && c.campo === 'pago_chofer' && !String(valor).trim()) placeholder = String(a.viaje.pago_chofer);
                      if (a && c.campo === 'flete' && !String(valor).trim() && a.viaje.precio_viaje) placeholder = String(a.viaje.precio_viaje);
                      if (a && c.campo === 'origen' && !String(valor).trim()) placeholder = a.viaje.origen;
                      return (
                        <td key={c.campo}>
                          <input
                            className={`form-input imp-input ${c.numero ? 'imp-num' : ''} ${clase}`}
                            type={tipo}
                            value={valor}
                            list={c.lista}
                            placeholder={placeholder}
                            inputMode={c.numero ? 'decimal' : undefined}
                            disabled={confirmando}
                            onChange={e => editar(idx, c.campo, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td className={`mono imp-num ${a && a.viaje.ganancia < 0 ? 'imp-negativo' : ''}`}>
                      {a && a.errores.length === 0 ? formatUSD(a.viaje.ganancia) : '—'}
                    </td>
                  </tr>
                  {mensajes.length > 0 && (
                    <tr className={`imp-fila-mensajes ${atenuada ? 'imp-fila-excluida' : ''}`}>
                      <td></td>
                      <td colSpan={COLUMNAS.length + 3}>{mensajes}</td>
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
          <span>Página {paginaActual + 1} de {totalPaginas} · {indicesVisibles.length} filas</span>
          <button className="btn btn-ghost btn-sm" disabled={paginaActual >= totalPaginas - 1} onClick={() => setPagina(paginaActual + 1)}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      )}

      {/* Pie */}
      <div className="imp-pie">
        <div className="imp-pie-resumen">
          Se importarán <strong>{resumen.seleccionadas}</strong> de {resumen.total} viajes
          · Total fletes <strong>{formatUSD(resumen.totalFletes)}</strong>
          {resumen.error > 0 && <span className="imp-pie-errores"> · {resumen.error} con errores no se importarán</span>}
        </div>
        <div className="imp-pie-botones">
          <button className="btn btn-secondary" onClick={onCancelar} disabled={confirmando}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={!listo || confirmando || resumen.seleccionadas === 0}
            onClick={confirmar}
          >
            {confirmando
              ? <><span className="material-symbols-outlined imp-girando">progress_activity</span> Importando…</>
              : <><span className="material-symbols-outlined">upload</span> Importar {resumen.seleccionadas} viaje{resumen.seleccionadas === 1 ? '' : 's'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportVerificacionViajes;
