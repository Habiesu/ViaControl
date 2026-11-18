const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFecha, mapearFilasExcel, sugerir, normalizarNombre,
  crearContexto, analizarFilas, resumir
} = require('../electron/import/viajesImport');

const catalogos = {
  choferes: [
    { id: 1, nombre: 'Juan Pérez', porcentaje_comision: 12, id_propietario: 7 },
    { id: 2, nombre: 'Pedro Rojas', porcentaje_comision: null, id_propietario: null }
  ],
  gandolas: [
    { id: 10, placa: 'ABC-123', id_propietario: 8 },
    { id: 11, placa: 'XYZ-987', id_propietario: null }
  ],
  propietarios: [
    { id: 7, nombre: 'María López', uuid: 'u-7' },
    { id: 8, nombre: 'Transportes Andes', uuid: 'u-8' }
  ],
  rutas: [
    { origen: 'Puerto Cabello', destino: 'Caracas', precio_base: 1500, activo: 1 },
    { origen: 'La Guaira', destino: 'Valencia', precio_base: 900, activo: 1 }
  ],
  viajes: [
    { fecha: '2026-01-10', contenedor: 'MSCU1234567', id_gandola: 'ABC-123', id_chofer: 'Juan Pérez', destino: 'Caracas' }
  ]
};

const ctx = () => crearContexto(catalogos, { hoy: '2026-06-01' });

function fila(datos, extra = {}) {
  return {
    fila: extra.fila || 2,
    crear: extra.crear || {},
    datos: {
      fecha: '2026-02-01', origen: 'Puerto Cabello', destino: 'Caracas', gandola: 'ABC-123',
      chofer: 'Juan Pérez', propietario: '', contenedor: '', flete: '1500', gasoil: '100',
      peajes: '20', viaticos: '30', pago_chofer: '', notas: '', ...datos
    }
  };
}

test('parseFecha acepta los formatos habituales', () => {
  assert.equal(parseFecha('2026-01-15'), '2026-01-15');
  assert.equal(parseFecha('2026/1/5'), '2026-01-05');
  assert.equal(parseFecha('15/01/2026'), '2026-01-15');
  assert.equal(parseFecha('5-1-26'), '2026-01-05');
  assert.equal(parseFecha('15.01.2026'), '2026-01-15');
  assert.equal(parseFecha(46037), '2026-01-15'); // número de serie de Excel
  assert.equal(parseFecha('46037'), '2026-01-15');
});

test('parseFecha rechaza fechas imposibles o vacías', () => {
  assert.equal(parseFecha('31/02/2026'), null);
  assert.equal(parseFecha('2026-13-01'), null);
  assert.equal(parseFecha('ayer'), null);
  assert.equal(parseFecha(''), null);
  assert.equal(parseFecha(12), null);
});

test('mapearFilasExcel reconoce alias y tildes en los encabezados y omite filas vacías', () => {
  const { filas, faltantes } = mapearFilasExcel([
    { 'Fecha': 46037, 'Destino': 'Caracas', 'Placa': 'ABC-123', 'Conductor': 'Juan', 'Viáticos': 20, 'Pago_Chofer': 150 },
    { 'Fecha': '', 'Destino': '', 'Placa': '', 'Conductor': '', 'Viáticos': '', 'Pago_Chofer': '' }
  ]);
  assert.deepEqual(faltantes, []);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].fila, 2);
  assert.equal(filas[0].datos.fecha, '2026-01-15');
  assert.equal(filas[0].datos.gandola, 'ABC-123');
  assert.equal(filas[0].datos.chofer, 'Juan');
  assert.equal(filas[0].datos.viaticos, '20');
  assert.equal(filas[0].datos.pago_chofer, '150');
});

test('mapearFilasExcel informa de las columnas obligatorias que faltan', () => {
  const { faltantes } = mapearFilasExcel([{ FECHA: '2026-01-01', DESTINO: 'X' }]);
  assert.deepEqual(faltantes, ['GANDOLA', 'CHOFER']);
});

test('fila correcta: calcula pago con la comisión del chofer y guarda nombre y placa canónicos', () => {
  const [r] = analizarFilas([fila({ chofer: 'juan perez', gandola: 'abc 123' })], ctx());
  assert.equal(r.estado, 'aviso'); // aviso por el pago calculado
  assert.deepEqual(r.errores, []);
  assert.equal(r.viaje.id_chofer, 'Juan Pérez');
  assert.equal(r.viaje.id_gandola, 'ABC-123');
  assert.equal(r.viaje.pago_chofer, 180); // 12% de 1500
  assert.equal(r.viaje.total_gastos, 330);
  assert.equal(r.viaje.ganancia, 1170);
  // propietario automático: primero el del chofer
  assert.equal(r.viaje.id_propietario, 7);
  assert.equal(r.viaje.propietario_uuid, 'u-7');
});

test('fila sin avisos queda como lista', () => {
  const [r] = analizarFilas([fila({ pago_chofer: '150' })], ctx());
  assert.equal(r.estado, 'lista');
  assert.equal(r.viaje.pago_chofer, 150);
});

test('sin flete usa la tarifa de la ruta y, si no hay, es error', () => {
  const [conTarifa, sinTarifa] = analizarFilas([
    fila({ flete: '', pago_chofer: '100' }),
    fila({ flete: '', destino: 'Mérida', pago_chofer: '100', fila: 3 })
  ], ctx());
  assert.equal(conTarifa.viaje.precio_viaje, 1500);
  assert.equal(conTarifa.estado, 'aviso');
  assert.equal(sinTarifa.estado, 'error');
  assert.ok(sinTarifa.errores.some(e => e.campo === 'flete'));
});

test('chofer y gandola inexistentes dan error con sugerencias', () => {
  const [r] = analizarFilas([fila({ chofer: 'Juan Peres', gandola: 'ABC-128' })], ctx());
  assert.equal(r.estado, 'error');
  assert.deepEqual(r.sugerencias.chofer, ['Juan Pérez']);
  assert.equal(r.sugerencias.gandola[0], 'ABC-123');
});

test('marcar "crear" convierte el error en aviso de creación', () => {
  const [r] = analizarFilas([fila({ chofer: 'Luis  Mora', gandola: 'new-1', pago_chofer: '100' }, { crear: { chofer: true, gandola: true } })], ctx());
  assert.equal(r.estado, 'aviso');
  assert.equal(r.resuelto.chofer.nuevo, true);
  assert.equal(r.viaje.id_chofer, 'Luis Mora');
  assert.equal(r.viaje.id_gandola, 'NEW-1');
});

test('propietario inexistente es error; uno válido se respeta', () => {
  const [malo, bueno] = analizarFilas([
    fila({ propietario: 'Nadie' }),
    fila({ propietario: 'transportes andes', fila: 3, fecha: '2026-02-02' })
  ], ctx());
  assert.equal(malo.estado, 'error');
  assert.equal(bueno.viaje.id_propietario, 8);
});

test('errores de datos: fecha, destino, montos', () => {
  const [r] = analizarFilas([fila({ fecha: '30/02/2026', destino: '', gasoil: 'abc' })], ctx());
  const campos = r.errores.map(e => e.campo).sort();
  assert.deepEqual(campos, ['destino', 'fecha', 'gasoil']);
});

test('sin origen se usa el valor por defecto con aviso; fecha futura avisa', () => {
  const [r] = analizarFilas([fila({ origen: '', fecha: '2026-12-01', pago_chofer: '100' })], ctx());
  assert.equal(r.viaje.origen, 'Puerto Cabello');
  assert.equal(r.estado, 'aviso');
  assert.ok(r.avisos.some(a => a.campo === 'fecha'));
});

test('duplicados: contra el sistema por contenedor o por fecha+gandola+chofer+destino, y dentro del archivo', () => {
  const rs = analizarFilas([
    fila({ contenedor: 'mscu 1234567', pago_chofer: '100' }, { fila: 2 }),
    fila({ fecha: '2026-01-10', pago_chofer: '100' }, { fila: 3 }),
    fila({ fecha: '2026-03-01', pago_chofer: '100' }, { fila: 4 }),
    fila({ fecha: '2026-03-01', pago_chofer: '100' }, { fila: 5 })
  ], ctx());
  assert.deepEqual(rs.map(r => r.estado), ['duplicado', 'duplicado', 'lista', 'duplicado']);
  assert.equal(rs[3].duplicado.fila, 4);
  assert.deepEqual(resumir(rs), { total: 4, lista: 1, aviso: 0, error: 0, duplicado: 3 });
});

test('sugerir ignora opciones muy distintas', () => {
  assert.deepEqual(sugerir('Zacarías', ['Juan Pérez', 'Pedro Rojas'], normalizarNombre), []);
});
