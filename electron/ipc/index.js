const { registerCatalogosIPC } = require('./catalogosIPC');
const { registerViajesIPC } = require('./viajesIPC');
const { registerGastosIPC } = require('./gastosIPC');
const { registerReportesIPC } = require('./reportesIPC');
const { registerThemeIPC } = require('./themeIPC');
const { registerSaldosIPC } = require('./saldosIPC');
const { registerAjustesIPC } = require('./ajustesIPC');
const { registerAuthIPC } = require('../auth/authIPC');
const { registerSyncIPC } = require('../sync/syncIPC');

function registerAllIPC() {
  registerCatalogosIPC();
  registerViajesIPC();
  registerGastosIPC();
  registerReportesIPC();
  registerThemeIPC();
  registerSaldosIPC();
  registerAjustesIPC();
  registerAuthIPC();
  registerSyncIPC();
}

module.exports = { registerAllIPC };

