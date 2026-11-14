// ============================================================
// Utilidades globales de la aplicación ViaControl
// ============================================================

export const PREFIJOS_VZLA = ['0412', '0414', '0422', '0424', '0416', '0426'];

/**
 * Escapa texto antes de insertarlo en HTML construido a mano (ventanas de impresión con document.write).
 * Sin esto, un dato como `<img onerror=...>` (p. ej. importado desde Excel) se ejecutaría con acceso a Node.
 */
export function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formatea un número como monto en dólares: $1,234.56 */
export function formatUSD(num) {
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  return '$' + Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Retorna la fecha de hoy en formato YYYY-MM-DD (hora local, no UTC) */
export function getTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const formatDate = (date) => {
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
  };

  const calcEstaSemana = () => {
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(d + diffToMonday);
    const inicio = formatDate(monday);
    const fin = formatDate(today);
    return { inicio, fin, desde: inicio, hasta: fin };
  };

  const calcSemanaAnterior = () => {
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek - 7;
    const prevMonday = new Date(today);
    prevMonday.setDate(d + diffToMonday);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);
    const inicio = formatDate(prevMonday);
    const fin = formatDate(prevSunday);
    return { inicio, fin, desde: inicio, hasta: fin };
  };

  const calcMesActual = () => {
    const firstDay = new Date(y, m, 1);
    const inicio = formatDate(firstDay);
    const fin = formatDate(today);
    return { inicio, fin, desde: inicio, hasta: fin };
  };

  const calcMesAnterior = () => {
    const firstPrev = new Date(y, m - 1, 1);
    const lastPrev = new Date(y, m, 0);
    const inicio = formatDate(firstPrev);
    const fin = formatDate(lastPrev);
    return { inicio, fin, desde: inicio, hasta: fin };
  };

  if (preset === 'esta_semana' || preset === 'esta-semana') return calcEstaSemana();
  if (preset === 'semana_anterior' || preset === 'semana-anterior') return calcSemanaAnterior();
  if (preset === 'mes_actual' || preset === 'este_mes' || preset === 'este-mes') return calcMesActual();
  if (preset === 'mes_anterior' || preset === 'mes-anterior') return calcMesAnterior();

  return {
    inicio: '',
    fin: '',
    desde: '',
    hasta: '',
    esteMes: calcMesActual(),
    mesActual: calcMesActual(),
    mesAnterior: calcMesAnterior(),
    estaSemana: calcEstaSemana(),
    semanaAnterior: calcSemanaAnterior()
  };
}
