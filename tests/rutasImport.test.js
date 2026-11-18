const test = require('node:test');
const assert = require('node:assert/strict');
const { leerHojasRutas, analizarRutas, resumirRutas } = require('../electron/import/rutasImport');

test('leerHojasRutas usa la hoja como origen y salta encabezados y filas vacías', () => {
  const filas = leerHojasRutas([
    { nombre: 'Puerto Cabello', filas: [['DESTINO', 'PRECIO'], ['Caracas', 1500], ['', ''], ['TARIFAS 2026', ''], ['Valencia', '350']] },
    { nombre: 'La Guaira ', filas: [['DESTINO', 'PRECIO'], ['Maracay', 800]] }
  ]);
  assert.deepEqual(filas.map(f => [f.datos.origen, f.datos.destino, f.datos.precio, f.filaExcel]), [
    ['Puerto Cabello', 'Caracas', '1500', 2],
    ['Puerto Cabello', 'Valencia', '350', 5],
    ['La Guaira', 'Maracay', '800', 2]
  ]);
});

test('analizarRutas clasifica nuevas, cambios, iguales y errores', () => {
  const existentes = [
    { id: 1, origen: 'Puerto Cabello', destino: 'CARACAS', precio_base: 1400, activo: 1 },
    { id: 2, origen: 'Puerto Cabello', destino: 'Valencia', precio_base: 350, activo: 1 },
    { id: 3, origen: 'La Guaira', destino: 'Maracay', precio_base: 800, activo: 0 }
  ];
  const f = (origen, destino, precio) => ({ datos: { origen, destino, precio } });
  const a = analizarRutas([
    f('Puerto Cabello', 'Caracas', '1500'),
    f('puerto cabello', 'valencia', '350'),
    f('La Guaira', 'Maracay', '800'),
    f('Guanta', 'Barcelona', '600'),
    f('Guanta', 'Mérida', 'abc'),
    f('Guanta', 'barcelona', '650')
  ], existentes);
  assert.deepEqual(a.map(x => x.estado), ['cambia', 'igual', 'cambia', 'nueva', 'error', 'error']);
  assert.equal(a[0].anterior.precio_base, 1400);
  assert.equal(a[0].ruta.precio_base, 1500);
  assert.equal(a[2].anterior.activo, false);
  assert.match(a[5].errores[0], /repetida/);
  assert.deepEqual(resumirRutas(a), { total: 6, nueva: 1, cambia: 2, igual: 1, error: 2 });
});
