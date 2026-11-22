import React, { useRef, useState } from 'react';
import { Mes, aISO, deISO } from './DateRangePicker.jsx';

/**
 * Campo de fecha (YYYY-MM-DD) con las mismas props que <input type="date">.
 * - Clic en el día, mes o año: se edita solo esa parte (edición nativa del input).
 * - Clic en el resto del campo: abre el calendario.
 * onChange recibe { target: { value } } igual que un input, para no cambiar los llamadores.
 */
export default function DatePicker({ value, onChange, className, style, ...inputProps }) {
  const caja = useRef(null);
  const panel = useRef(null);
  const input = useRef(null);
  const abiertoAlPulsar = useRef(false);
  const base = value ? deISO(value) : new Date();
  const [vista, setVista] = useState({ anio: base.getFullYear(), mes: base.getMonth() });

  const abrir = () => {
    setVista({ anio: base.getFullYear(), mes: base.getMonth() });
    panel.current?.showPopover({ source: caja.current });
  };
  const elegir = (iso) => {
    onChange?.({ target: { value: iso } });
    panel.current?.hidePopover();
    input.current?.focus();
  };
  const mover = (n) => setVista(v => { const d = new Date(v.anio, v.mes + n, 1); return { anio: d.getFullYear(), mes: d.getMonth() }; });

  return (
    <div ref={caja} className="dp" style={style}
      // Si ya estaba abierto, el navegador lo cierra con este clic: no reabrirlo (funciona como interruptor)
      onPointerDown={() => { abiertoAlPulsar.current = !!panel.current?.matches(':popover-open'); }}
      onClick={e => { if (e.target === caja.current && !abiertoAlPulsar.current) abrir(); }}>
      <input ref={input} type="date" className="dp-input" value={value} onChange={onChange}
        onKeyDown={e => { if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); abrir(); } }}
        {...inputProps} />

      <div ref={panel} popover="auto" className="drp-panel dp-panel">
        <div className="drp-calendario">
          <button type="button" className="drp-nav prev" aria-label="Mes anterior" onClick={() => mover(-1)}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button type="button" className="drp-nav next" aria-label="Mes siguiente" onClick={() => mover(1)}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <Mes anio={vista.anio} mes={vista.mes} desde={value} hasta={value} previa={null} onDia={elegir} onHover={() => {}} />
          <div className="dp-pie">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => elegir(aISO(new Date()))}>Hoy</button>
          </div>
        </div>
      </div>
    </div>
  );
}
