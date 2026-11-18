/**
 * Lógica pura de la importación de rutas y tarifas desde Excel.
 *
 * Formato del Excel (el mismo de Listas_de_Precios_Fletes.xlsx): cada hoja es un ORIGEN,
 * la columna A es el DESTINO y la columna B el PRECIO. La primera fila es el encabezado.
 */
const { parseMonto } = require('../utils/numUtils');
const { normalizarNombre } = require('./viajesImport');

function texto(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/**
 * hojas = [{ nombre, filas }] donde `filas` es el resultado de
 * XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).
 */
function leerHojasRutas(hojas) {
  const filas = [];
  for (const hoja of hojas) {
    const origen = texto(hoja.nombre);
    (hoja.filas || []).forEach((row, i) => {
      if (i === 0 || !row) return; // encabezado
      const destino = texto(row[0]);
      const precio = texto(row[1]);
      if (!destino && !precio) return;
      if (destino.toUpperCase() === 'DESTINO' || destino.toUpperCase().includes('TARIFAS')) return;
      filas.push({ hoja: origen, filaExcel: i + 1, datos: { origen, destino, precio } });
    });
  }
  return filas;
}

function claveRuta(origen, destino) {
  return normalizarNombre(origen) + '|' + normalizarNombre(destino);
}

/**
 * Compara cada fila con las rutas existentes.
 * Estados: 'nueva', 'cambia' (precio distinto o ruta inactiva), 'igual' (no cambia nada), 'error'.
 */
function analizarRutas(filas, rutasExistentes) {
  const existentes = new Map();
  for (const r of rutasExistentes || []) {
    const k = claveRuta(r.origen, r.destino);
    if (!existentes.has(k)) existentes.set(k, r);
  }
  const vistas = new Map();

  return filas.map((f, idx) => {
    const d = f.datos || {};
    const origen = texto(d.origen);
    const destino = texto(d.destino);
    const precioTxt = texto(d.precio);
    const precio = parseMonto(precioTxt);
    const errores = [];

    if (!origen) errores.push('Falta el origen');
    if (!destino) errores.push('Falta el destino');
    if (!precioTxt) errores.push('Falta el precio');
    else if (!/\d/.test(precioTxt) || precio <= 0) errores.push(`Precio inválido: "${precioTxt}"`);

    const k = claveRuta(origen, destino);
    if (origen && destino) {
      if (vistas.has(k)) errores.push(`Ruta repetida en este archivo (también en ${vistas.get(k)})`);
      else vistas.set(k, `${f.hoja || origen} fila ${f.filaExcel || idx + 1}`);
    }

    const actual = existentes.get(k) || null;
    let estado;
    if (errores.length > 0) estado = 'error';
    else if (!actual) estado = 'nueva';
    else if (parseMonto(actual.precio_base) !== precio || Number(actual.activo) !== 1) estado = 'cambia';
    else estado = 'igual';

    return {
      estado,
      errores,
      ruta: { origen, destino, precio_base: precio },
      anterior: actual ? { id: actual.id, precio_base: parseMonto(actual.precio_base), activo: Number(actual.activo) === 1 } : null
    };
  });
}

function resumirRutas(analisis) {
  const r = { total: analisis.length, nueva: 0, cambia: 0, igual: 0, error: 0 };
  for (const a of analisis) r[a.estado]++;
  return r;
}

module.exports = { leerHojasRutas, analizarRutas, resumirRutas };
