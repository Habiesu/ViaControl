// ============================================================
// Utilidades globales de la aplicación ViaControl
// ============================================================

export const PREFIJOS_VZLA = ['0412', '0414', '0422', '0424', '0416', '0426'];

/** Formatea un número como monto en dólares: $1,234.56 */
export function formatUSD(num) {
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  return '$' + Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Retorna la fecha de hoy en formato YYYY-MM-DD */
export function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

/** Parsea un string de teléfono venezolano a { prefijo, numero } */
export function parseTelefono(telStr) {
  if (!telStr) return { prefijo: '0414', numero: '' };
  const cleaned = String(telStr).replace(/^\+58\s*/, '').replace(/\D/g, '');
  if (cleaned.length >= 10) {
    const pref = '0' + cleaned.slice(cleaned.length - 10, cleaned.length - 7);
    const num = cleaned.slice(cleaned.length - 7);
    if (PREFIJOS_VZLA.includes(pref)) return { prefijo: pref, numero: num };
  }
  if (cleaned.length === 7) return { prefijo: '0414', numero: cleaned };
  return { prefijo: '0414', numero: cleaned };
}

/** Construye el string de teléfono a partir de prefijo y número */
export function buildTelefono(prefijo, numero) {
  const numClean = (numero || '').replace(/\D/g, '');
  if (!numClean) return '';
  return `${prefijo}-${numClean}`;
}

/** Genera rangos de fechas predefinidos para los filtros */
export function getDateRangePresets(preset) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const dayOfWeek = today.getDay();
  const formatDate = (date) => date.toISOString().split('T')[0];

  if (preset === 'esta_semana') {
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(d + diffToMonday);
    return { inicio: formatDate(monday), fin: formatDate(today) };
  } else if (preset === 'semana_anterior') {
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek - 7;
    const prevMonday = new Date(today);
    prevMonday.setDate(d + diffToMonday);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);
    return { inicio: formatDate(prevMonday), fin: formatDate(prevSunday) };
  } else if (preset === 'mes_actual') {
    const firstDay = new Date(y, m, 1);
    return { inicio: formatDate(firstDay), fin: formatDate(today) };
  } else if (preset === 'mes_anterior') {
    const firstPrev = new Date(y, m - 1, 1);
    const lastPrev = new Date(y, m, 0);
    return { inicio: formatDate(firstPrev), fin: formatDate(lastPrev) };
  }
  return { inicio: '', fin: '' };
}
