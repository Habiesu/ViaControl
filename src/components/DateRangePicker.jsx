import React, { useId, useRef, useState } from 'react';
import { getDateRangePresets } from '../utils/helpers.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTOS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];
const DIAS = ['Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.', 'Dom.'];

export const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const deISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const textoFecha = (s) => { const d = deISO(s); return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`; };

function atajos(permitirVacio) {
  const hoy = new Date();
  const hace = (n) => { const d = new Date(hoy); d.setDate(d.getDate() - n); return aISO(d); };
  const p = (k) => { const r = getDateRangePresets(k); return [r.inicio, r.fin]; };
  const lista = [
    ['Hoy', [aISO(hoy), aISO(hoy)]],
    ['Últimos 7 días', [hace(6), aISO(hoy)]],
    ['Últimos 30 días', [hace(29), aISO(hoy)]],
    ['Semana anterior', p('semana_anterior')],
    ['Esta semana', p('esta_semana')],
    ['Mes anterior', p('mes_anterior')],
    ['Este mes hasta hoy', p('mes_actual')],
    ['Este mes', [aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), aISO(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))]],
  ];
  return permitirVacio ? [['Todas las fechas', ['', '']], ...lista] : lista;
}

export function Mes({ anio, mes, desde, hasta, previa, onDia, onHover }) {
  const primero = new Date(anio, mes, 1);
  const huecos = (primero.getDay() + 6) % 7; // semana empieza en lunes
  const total = new Date(anio, mes + 1, 0).getDate();
  const fin = hasta || previa;
  const hoyISO = aISO(new Date());
  const [a, b] = desde && fin && fin < desde ? [fin, desde] : [desde, fin];
  return (
    <div className="drp-mes">
      <div className="drp-mes-titulo">{MESES[mes]} {anio}</div>
      <div className="drp-grid">
        {DIAS.map(d => <span key={d} className="drp-dia-nombre">{d}</span>)}
        {Array.from({ length: huecos }, (_, i) => <span key={'h' + i} />)}
        {Array.from({ length: total }, (_, i) => {
          const iso = aISO(new Date(anio, mes, i + 1));
          const extremo = iso === desde || iso === hasta;
          const esHoy = iso === hoyISO;
          const enRango = a && b && iso >= a && iso <= b;
          return (
            <button key={iso} type="button"
              className={`drp-dia${enRango ? ' en-rango' : ''}${extremo ? ' extremo' : ''}${iso === a ? ' inicio' : ''}${iso === b ? ' fin' : ''}${esHoy ? ' hoy' : ''}`}
              aria-label={textoFecha(iso)} aria-pressed={extremo}
              onClick={() => onDia(iso)} onMouseEnter={() => onHover(iso)}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Selector de rango de fechas (YYYY-MM-DD) con atajos y dos meses visibles.
 * onChange(desde, hasta). Con permitirVacio, ofrece "Todas las fechas" ('', '').
 */
export default function DateRangePicker({ desde, hasta, onChange, permitirVacio = false }) {
  const id = useId();
  const panel = useRef(null);
  const base = desde ? deISO(desde) : new Date();
  const [vista, setVista] = useState({ anio: base.getFullYear(), mes: base.getMonth() });
  const [inicioTemp, setInicioTemp] = useState(null); // primer clic, esperando el segundo
  const [previa, setPrevia] = useState(null);

  const aplicar = (d, h) => { onChange(d, h); setInicioTemp(null); panel.current?.hidePopover(); };
  const onDia = (iso) => {
    if (!inicioTemp) { setInicioTemp(iso); return; }
    aplicar(iso < inicioTemp ? iso : inicioTemp, iso < inicioTemp ? inicioTemp : iso);
  };
  const mover = (n) => setVista(v => { const d = new Date(v.anio, v.mes + n, 1); return { anio: d.getFullYear(), mes: d.getMonth() }; });
  const sig = new Date(vista.anio, vista.mes + 1, 1);
  const lista = atajos(permitirVacio);
  const activo = lista.find(([, [d, h]]) => d === desde && h === hasta)?.[0];

  // Mientras se elige, se muestra el inicio provisional en lugar del rango guardado
  const selDesde = inicioTemp || desde;
  const selHasta = inicioTemp ? null : hasta;

  return (
    <div className="drp">
      <button type="button" className="drp-boton" popoverTarget={id}>
        <span className="material-symbols-outlined" aria-hidden="true">calendar_month</span>
        {desde && hasta
          ? <><span>{textoFecha(desde)}</span><span className="drp-sep">–</span><span>{textoFecha(hasta)}</span></>
          : <span>Todas las fechas</span>}
      </button>

      <div id={id} ref={panel} popover="auto" className="drp-panel"
        onToggle={e => {
          if (e.newState === 'open') setVista({ anio: base.getFullYear(), mes: base.getMonth() });
          else { setInicioTemp(null); setPrevia(null); }
        }}>
        <div className="drp-atajos">
          {lista.map(([nombre, [d, h]]) => (
            <button key={nombre} type="button" className={`drp-atajo${activo === nombre ? ' activo' : ''}`} onClick={() => aplicar(d, h)}>
              {nombre}
            </button>
          ))}
        </div>
        <div className="drp-calendario" onMouseLeave={() => setPrevia(null)}>
          <button type="button" className="drp-nav prev" aria-label="Mes anterior" onClick={() => mover(-1)}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button type="button" className="drp-nav next" aria-label="Mes siguiente" onClick={() => mover(1)}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <Mes anio={vista.anio} mes={vista.mes} desde={selDesde} hasta={selHasta} previa={inicioTemp && previa} onDia={onDia} onHover={setPrevia} />
          <Mes anio={sig.getFullYear()} mes={sig.getMonth()} desde={selDesde} hasta={selHasta} previa={inicioTemp && previa} onDia={onDia} onHover={setPrevia} />
          <p className="drp-ayuda" aria-live="polite">{inicioTemp ? 'Elige la fecha final' : 'Elige la fecha inicial'}</p>
        </div>
      </div>
    </div>
  );
}
