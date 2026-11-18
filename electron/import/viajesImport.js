/**
 * Lógica pura de la importación de viajes desde Excel.
 *
 * No depende de Electron ni de la base de datos: recibe los catálogos ya cargados
 * y devuelve, para cada fila, su estado (lista / aviso / error / duplicado), los
 * valores interpretados y las sugerencias para resolver lo que no se encuentra.
 * Así se puede probar con `node --test` y se usa igual al analizar y al confirmar.
 */
const { parseMonto, redondear2 } = require('../utils/numUtils');

const ORIGEN_POR_DEFECTO = 'Puerto Cabello';
const COMISION_POR_DEFECTO = 10;

// Campos editables de una fila, en el orden en que se muestran
const CAMPOS = [
  'fecha', 'origen', 'destino', 'gandola', 'chofer', 'propietario',
  'contenedor', 'flete', 'gasoil', 'peajes', 'viaticos', 'pago_chofer', 'notas'
];

// Encabezado del Excel (ya normalizado) → campo interno
const ALIAS_ENCABEZADOS = {
  'FECHA': 'fecha',
  'ORIGEN': 'origen',
  'DESTINO': 'destino',
  'GANDOLA': 'gandola', 'UNIDAD': 'gandola', 'PLACA': 'gandola', 'CAMION': 'gandola',
  'CHOFER': 'chofer', 'CONDUCTOR': 'chofer',
  'PROPIETARIO': 'propietario', 'DUENO': 'propietario',
  'CONTENEDOR': 'contenedor',
  'FLETE': 'flete', 'PRECIO': 'flete', 'MONTO': 'flete', 'PRECIO VIAJE': 'flete',
  'GASOIL': 'gasoil', 'GASOLINA': 'gasoil', 'COMBUSTIBLE': 'gasoil',
  'PEAJES': 'peajes', 'PEAJE': 'peajes',
  'VIATICOS': 'viaticos', 'VIATICO': 'viaticos',
  'PAGO CHOFER': 'pago_chofer', 'PAGO DEL CHOFER': 'pago_chofer', 'PAGOCHOFER': 'pago_chofer',
  'NOTAS': 'notas', 'NOTA': 'notas', 'OBSERVACIONES': 'notas'
};

const CAMPOS_OBLIGATORIOS = ['fecha', 'destino', 'gandola', 'chofer'];
const NOMBRE_COLUMNA = {
  fecha: 'FECHA', origen: 'ORIGEN', destino: 'DESTINO', gandola: 'GANDOLA', chofer: 'CHOFER'
};

// ─── Normalización de texto ─────────────────────────────────────────────────

function quitarTildes(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Para comparar nombres: sin tildes, minúsculas y espacios simples. */
function normalizarNombre(s) {
  return quitarTildes(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Para comparar placas: mayúsculas, sin espacios ni guiones. */
function normalizarPlaca(s) {
  return quitarTildes(s == null ? '' : s).toUpperCase().replace(/[\s\-_.]/g, '');
}

function normalizarEncabezado(s) {
  return quitarTildes(s == null ? '' : s).toUpperCase().replace(/[_\s]+/g, ' ').trim();
}

function texto(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// ─── Fechas ─────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }

function fechaValida(a, m, d) {
  if (!(a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Número de serie de Excel (días desde 1899-12-30) → 'AAAA-MM-DD'. */
function serialExcelAFecha(n) {
  const ms = Math.round(n) * 86400000 + Date.UTC(1899, 11, 30);
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Interpreta una fecha del Excel. Acepta AAAA-MM-DD, AAAA/MM/DD, DD/MM/AAAA,
 * DD-MM-AAAA, DD.MM.AAAA (año de 2 dígitos = 20AA), número de serie de Excel y Date.
 * Devuelve 'AAAA-MM-DD' o null si no es una fecha válida.
 */
function parseFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    return `${valor.getFullYear()}-${pad2(valor.getMonth() + 1)}-${pad2(valor.getDate())}`;
  }

  const s = String(valor).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return fechaValida(a, mes, d) ? `${a}-${pad2(mes)}-${pad2(d)}` : null;
  }

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mes = Number(m[2]);
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return fechaValida(a, mes, d) ? `${a}-${pad2(mes)}-${pad2(d)}` : null;
  }

  // Número de serie de Excel (≈ 1990-01-01 … 2100-12-31)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 32874 && n <= 73415) return serialExcelAFecha(n);
  }
  return null;
}

// ─── Lectura del Excel ──────────────────────────────────────────────────────

/**
 * Convierte las filas que devuelve `XLSX.utils.sheet_to_json(ws, { defval: '' })`
 * en filas con los campos internos. Devuelve también las columnas obligatorias que faltan.
 */
function mapearFilasExcel(rowsExcel) {
  const encabezados = rowsExcel.length > 0 ? Object.keys(rowsExcel[0]) : [];
  const mapa = {};
  for (const enc of encabezados) {
    const campo = ALIAS_ENCABEZADOS[normalizarEncabezado(enc)];
    if (campo && !Object.values(mapa).includes(campo)) mapa[enc] = campo;
  }
  const presentes = new Set(Object.values(mapa));
  const faltantes = CAMPOS_OBLIGATORIOS.filter(c => !presentes.has(c)).map(c => NOMBRE_COLUMNA[c]);

  const filas = [];
  rowsExcel.forEach((r, i) => {
    const datos = {};
    for (const c of CAMPOS) datos[c] = '';
    for (const [enc, campo] of Object.entries(mapa)) {
      const v = r[enc];
      datos[campo] = v === null || v === undefined ? '' : (typeof v === 'number' ? v : String(v).trim());
    }
    // Mostrar la fecha ya interpretada si se puede; si no, se deja tal cual para que el usuario la corrija
    if (datos.fecha !== '') {
      const f = parseFecha(datos.fecha);
      datos.fecha = f || String(datos.fecha);
    }
    for (const c of CAMPOS) if (typeof datos[c] === 'number') datos[c] = String(datos[c]);

    const vacia = CAMPOS.every(c => texto(datos[c]) === '');
    if (!vacia) filas.push({ fila: i + 2, datos });
  });

  return { filas, faltantes };
}

// ─── Sugerencias por parecido ───────────────────────────────────────────────

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Devuelve hasta `max` valores de `opciones` parecidos a `valor`, del más al menos parecido. */
function sugerir(valor, opciones, normalizar, max = 3) {
  const v = normalizar(valor);
  if (!v) return [];
  const puntuadas = [];
  for (const op of opciones) {
    const o = normalizar(op);
    if (!o) continue;
    const dist = levenshtein(v, o);
    const largo = Math.max(v.length, o.length);
    const similitud = 1 - dist / largo;
    const contiene = o.includes(v) || v.includes(o);
    if (similitud >= 0.6 || (contiene && Math.min(v.length, o.length) >= 3)) {
      puntuadas.push({ op, puntos: similitud + (contiene ? 0.2 : 0) });
    }
  }
  puntuadas.sort((x, y) => y.puntos - x.puntos);
  return puntuadas.slice(0, max).map(p => p.op);
}

// ─── Análisis ───────────────────────────────────────────────────────────────

/**
 * Prepara los índices de búsqueda a partir de los catálogos.
 * catalogos = { choferes, gandolas, propietarios, rutas, viajes } (filas de la BD, sin borrados)
 */
function crearContexto(catalogos, opciones = {}) {
  const choferes = catalogos.choferes || [];
  const gandolas = catalogos.gandolas || [];
  const propietarios = catalogos.propietarios || [];
  const rutas = catalogos.rutas || [];
  const viajes = catalogos.viajes || [];

  const porNombre = (lista, campo) => {
    const m = new Map();
    for (const x of lista) {
      const k = campo === 'placa' ? normalizarPlaca(x[campo]) : normalizarNombre(x[campo]);
      if (k && !m.has(k)) m.set(k, x);
    }
    return m;
  };

  const viajesPorContenedor = new Map();
  const viajesPorClave = new Map();
  for (const v of viajes) {
    const cont = normalizarPlaca(v.contenedor);
    if (cont && !viajesPorContenedor.has(cont)) viajesPorContenedor.set(cont, v);
    const k = claveViaje(v.fecha, v.id_gandola, v.id_chofer, v.destino);
    if (!viajesPorClave.has(k)) viajesPorClave.set(k, v);
  }

  return {
    choferes, gandolas, propietarios, rutas,
    mapChofer: porNombre(choferes, 'nombre'),
    mapGandola: porNombre(gandolas, 'placa'),
    mapPropietario: porNombre(propietarios, 'nombre'),
    viajesPorContenedor,
    viajesPorClave,
    hoy: opciones.hoy || fechaLocalHoy()
  };
}

function fechaLocalHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function claveViaje(fecha, gandola, chofer, destino) {
  return [texto(fecha), normalizarPlaca(gandola), normalizarNombre(chofer), normalizarNombre(destino)].join('|');
}

function buscarTarifa(ctx, origen, destino) {
  const o = normalizarNombre(origen);
  const d = normalizarNombre(destino);
  const activas = ctx.rutas.filter(r => r.activo === undefined || Number(r.activo) === 1);
  let ruta = activas.find(r => normalizarNombre(r.origen) === o && normalizarNombre(r.destino) === d);
  if (!ruta) ruta = activas.find(r => normalizarNombre(r.destino) === d);
  return ruta ? parseMonto(ruta.precio_base) : 0;
}

function esMontoInvalido(v) {
  const s = texto(v);
  return s !== '' && !/\d/.test(s);
}

/**
 * Analiza una fila.
 * fila = { fila, datos, crear: { chofer?: bool, gandola?: bool } }
 */
function analizarFila(fila, ctx) {
  const d = fila.datos || {};
  const crear = fila.crear || {};
  const errores = [];
  const avisos = [];
  const sugerencias = {};
  const resuelto = { chofer: null, gandola: null, propietario: null };

  // Fecha
  const fecha = parseFecha(d.fecha);
  if (texto(d.fecha) === '') errores.push({ campo: 'fecha', mensaje: 'Falta la fecha' });
  else if (!fecha) errores.push({ campo: 'fecha', mensaje: `Fecha inválida: "${texto(d.fecha)}"` });
  else if (fecha > ctx.hoy) avisos.push({ campo: 'fecha', mensaje: 'La fecha es futura' });

  // Origen y destino
  let origen = texto(d.origen);
  if (!origen) {
    origen = ORIGEN_POR_DEFECTO;
    avisos.push({ campo: 'origen', mensaje: `Sin origen: se usará "${ORIGEN_POR_DEFECTO}"` });
  }
  const destino = texto(d.destino);
  if (!destino) errores.push({ campo: 'destino', mensaje: 'Falta el destino' });

  // Gandola
  const gandolaTxt = texto(d.gandola);
  if (!gandolaTxt) {
    errores.push({ campo: 'gandola', mensaje: 'Falta la gandola' });
  } else {
    const g = ctx.mapGandola.get(normalizarPlaca(gandolaTxt));
    if (g) {
      resuelto.gandola = { id: g.id, placa: g.placa, id_propietario: g.id_propietario || null, nueva: false };
    } else if (crear.gandola) {
      resuelto.gandola = { id: null, placa: gandolaTxt.toUpperCase(), id_propietario: null, nueva: true };
      avisos.push({ campo: 'gandola', mensaje: `Se creará la gandola "${gandolaTxt.toUpperCase()}"` });
    } else {
      errores.push({ campo: 'gandola', tipo: 'no_existe', mensaje: `La gandola "${gandolaTxt}" no existe` });
      sugerencias.gandola = sugerir(gandolaTxt, ctx.gandolas.map(x => x.placa), normalizarPlaca);
    }
  }

  // Chofer
  const choferTxt = texto(d.chofer);
  if (!choferTxt) {
    errores.push({ campo: 'chofer', mensaje: 'Falta el chofer' });
  } else {
    const c = ctx.mapChofer.get(normalizarNombre(choferTxt));
    if (c) {
      resuelto.chofer = {
        id: c.id, nombre: c.nombre, id_propietario: c.id_propietario || null,
        porcentaje_comision: c.porcentaje_comision, nuevo: false
      };
    } else if (crear.chofer) {
      resuelto.chofer = { id: null, nombre: choferTxt.replace(/\s+/g, ' '), id_propietario: null, porcentaje_comision: COMISION_POR_DEFECTO, nuevo: true };
      avisos.push({ campo: 'chofer', mensaje: `Se creará el chofer "${resuelto.chofer.nombre}" (comisión ${COMISION_POR_DEFECTO}%)` });
    } else {
      errores.push({ campo: 'chofer', tipo: 'no_existe', mensaje: `El chofer "${choferTxt}" no existe` });
      sugerencias.chofer = sugerir(choferTxt, ctx.choferes.map(x => x.nombre), normalizarNombre);
    }
  }

  // Propietario (opcional: si se deja vacío se toma el del chofer o el de la gandola)
  const propTxt = texto(d.propietario);
  if (propTxt) {
    const p = ctx.mapPropietario.get(normalizarNombre(propTxt));
    if (p) {
      resuelto.propietario = { id: p.id, nombre: p.nombre, uuid: p.uuid || null };
    } else {
      errores.push({ campo: 'propietario', tipo: 'no_existe', mensaje: `El propietario "${propTxt}" no existe (bórralo para usar el del chofer o la gandola)` });
      sugerencias.propietario = sugerir(propTxt, ctx.propietarios.map(x => x.nombre), normalizarNombre);
    }
  } else {
    const idAuto = (resuelto.chofer && resuelto.chofer.id_propietario) || (resuelto.gandola && resuelto.gandola.id_propietario) || null;
    if (idAuto) {
      const p = ctx.propietarios.find(x => String(x.id) === String(idAuto));
      if (p) resuelto.propietario = { id: p.id, nombre: p.nombre, uuid: p.uuid || null, automatico: true };
    }
  }

  // Montos
  for (const campo of ['flete', 'gasoil', 'peajes', 'viaticos', 'pago_chofer']) {
    if (esMontoInvalido(d[campo])) errores.push({ campo, mensaje: `Monto inválido: "${texto(d[campo])}"` });
  }
  const gasoil = parseMonto(d.gasoil);
  const peajes = parseMonto(d.peajes);
  const viaticos = parseMonto(d.viaticos);
  for (const [campo, v] of [['gasoil', gasoil], ['peajes', peajes], ['viaticos', viaticos]]) {
    if (v < 0) errores.push({ campo, mensaje: 'El monto no puede ser negativo' });
  }

  let flete = parseMonto(d.flete);
  if (flete < 0) errores.push({ campo: 'flete', mensaje: 'El flete no puede ser negativo' });
  if (flete <= 0 && destino && !esMontoInvalido(d.flete)) {
    const tarifa = buscarTarifa(ctx, origen, destino);
    if (tarifa > 0) {
      flete = tarifa;
      avisos.push({ campo: 'flete', mensaje: `Sin flete: se usará la tarifa de la ruta (${tarifa.toFixed(2)})` });
    } else {
      errores.push({ campo: 'flete', mensaje: `Sin flete y sin tarifa registrada para "${origen}" ➔ "${destino}"` });
    }
  }

  let pagoChofer = parseMonto(d.pago_chofer);
  if (pagoChofer < 0) errores.push({ campo: 'pago_chofer', mensaje: 'El pago del chofer no puede ser negativo' });
  if (pagoChofer <= 0 && flete > 0) {
    const pctChofer = resuelto.chofer ? resuelto.chofer.porcentaje_comision : null;
    const pct = pctChofer === null || pctChofer === undefined || pctChofer === '' || isNaN(Number(pctChofer))
      ? COMISION_POR_DEFECTO
      : Number(pctChofer);
    pagoChofer = redondear2(flete * (pct / 100));
    avisos.push({ campo: 'pago_chofer', mensaje: `Pago del chofer calculado al ${pct}% del flete` });
  }

  const totalGastos = redondear2(pagoChofer + peajes + viaticos + gasoil);
  const ganancia = redondear2(flete - totalGastos);
  if (flete > 0 && ganancia < 0) avisos.push({ campo: 'flete', mensaje: 'Los gastos superan el flete (ganancia negativa)' });

  // Duplicado contra los viajes ya guardados
  let duplicado = null;
  const contenedor = texto(d.contenedor);
  const contNorm = normalizarPlaca(contenedor);
  if (contNorm && ctx.viajesPorContenedor.has(contNorm)) {
    const v = ctx.viajesPorContenedor.get(contNorm);
    duplicado = { origen: 'sistema', mensaje: `Ya existe un viaje con el contenedor "${contenedor}" (${v.fecha} a ${v.destino})` };
  } else if (fecha && destino && resuelto.gandola && resuelto.chofer) {
    const v = ctx.viajesPorClave.get(claveViaje(fecha, resuelto.gandola.placa, resuelto.chofer.nombre, destino));
    if (v) duplicado = { origen: 'sistema', mensaje: `Ya existe un viaje el ${fecha} con la misma gandola, chofer y destino` };
  }

  const viaje = {
    fecha,
    contenedor,
    origen,
    destino,
    id_gandola: resuelto.gandola ? resuelto.gandola.placa : gandolaTxt,
    id_chofer: resuelto.chofer ? resuelto.chofer.nombre : choferTxt,
    id_propietario: resuelto.propietario ? resuelto.propietario.id : null,
    propietario_uuid: resuelto.propietario ? resuelto.propietario.uuid : null,
    precio_viaje: flete,
    pago_chofer: pagoChofer,
    peajes,
    viaticos,
    gasoil,
    total_gastos: totalGastos,
    ganancia,
    notas: texto(d.notas)
  };

  return { fila: fila.fila, errores, avisos, sugerencias, resuelto, duplicado, viaje };
}

/**
 * Analiza todas las filas, marca los duplicados dentro del propio archivo y
 * calcula el estado final de cada una.
 */
function analizarFilas(filas, ctx) {
  const resultados = filas.map(f => analizarFila(f, ctx));
  const vistosContenedor = new Map();
  const vistosClave = new Map();

  for (const r of resultados) {
    if (!r.duplicado && r.errores.length === 0) {
      const cont = normalizarPlaca(r.viaje.contenedor);
      const clave = claveViaje(r.viaje.fecha, r.viaje.id_gandola, r.viaje.id_chofer, r.viaje.destino);
      const previa = (cont && vistosContenedor.get(cont)) || vistosClave.get(clave);
      if (previa !== undefined) {
        r.duplicado = { origen: 'archivo', fila: previa, mensaje: `Repite la fila ${previa} de este archivo` };
      }
      if (cont && !vistosContenedor.has(cont)) vistosContenedor.set(cont, r.fila);
      if (!vistosClave.has(clave)) vistosClave.set(clave, r.fila);
    }
    r.estado = r.errores.length > 0 ? 'error' : r.duplicado ? 'duplicado' : r.avisos.length > 0 ? 'aviso' : 'lista';
  }
  return resultados;
}

/** Resumen de conteos para la cabecera del modal. */
function resumir(resultados) {
  const res = { total: resultados.length, lista: 0, aviso: 0, error: 0, duplicado: 0 };
  for (const r of resultados) res[r.estado]++;
  return res;
}

module.exports = {
  CAMPOS,
  ORIGEN_POR_DEFECTO,
  COMISION_POR_DEFECTO,
  parseFecha,
  normalizarNombre,
  normalizarPlaca,
  mapearFilasExcel,
  sugerir,
  crearContexto,
  analizarFila,
  analizarFilas,
  resumir
};
