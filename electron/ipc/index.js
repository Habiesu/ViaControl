const { registerCatalogosIPC } = require('./catalogosIPC');
const { registerViajesIPC } = require('./viajesIPC');
const { registerGastosIPC } = require('./gastosIPC');
const { registerReportesIPC } = require('./reportesIPC');
const { registerThemeIPC } = require('./themeIPC');
const { registerSaldosIPC } = require('./saldosIPC');

function registerAllIPC() {
  registerCatalogosIPC();
  registerViajesIPC();
  registerGastosIPC();
  registerReportesIPC();
  registerThemeIPC();
  registerSaldosIPC();
}

module.exports = { registerAllIPC };
