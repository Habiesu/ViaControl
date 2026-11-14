/**
 * Utilidades numéricas y de parseo monetario seguro para ViaControl Backend
 */

function parseMonto(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  
  // Dejar solo dígitos, separadores y signo; quitar separadores sueltos al inicio/fin (ej: 'Bs. 1.250')
  const str = String(val).replace(/[^\d.,-]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  if (!str) return 0;

  let normalized = str;
  if (str.includes(',') && str.includes('.')) {
    // El separador que aparece último es el decimal: '1.250,50' o '1,250.50'
    const dec = str.lastIndexOf(',') > str.lastIndexOf('.') ? ',' : '.';
    const mil = dec === ',' ? '.' : ',';
    normalized = str.split(mil).join('').replace(dec, '.');
  } else if (str.includes(',') || str.includes('.')) {
    const sep = str.includes(',') ? ',' : '.';
    const partes = str.split(sep);
    // shortcut: un solo separador con 3 dígitos detrás ('1,250' / '1.250') se asume miles; '0,500' se toma como decimal
    const esMiles = partes.length > 2 || (partes[1].length === 3 && !/^-?0$/.test(partes[0]));
    normalized = esMiles ? partes.join('') : partes.join('.');
  }

  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function redondear2(val) {
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

module.exports = {
  parseMonto,
  redondear2
};
