import React, { useLayoutEffect, useRef } from 'react';

/**
 * Modal sobre <dialog> nativo abierto con showModal(): el navegador atrapa el foco, deja inerte la página
 * de fondo, cierra con Esc y devuelve el foco al botón que lo abrió.
 * - onClose: se llama con Esc (y con clic fuera si cerrarAlClicFuera). Sin onClose, el modal no se cierra solo.
 * - El elemento con data-autofocus recibe el foco al abrir (en confirmaciones de borrado: el botón seguro).
 */
export default function Modal({ onClose, cerrarAlClicFuera = false, labelledBy, className = 'modal-card', style, children }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const d = ref.current;
    d.showModal();
    d.querySelector('[data-autofocus]')?.focus();
    // El estado de React decide si se cierra: se cancela el cierre nativo y se avisa al padre
    const alCancelar = (e) => { e.preventDefault(); onCloseRef.current?.(); };
    // Chromium puede cerrar igual tras varios Esc seguidos: avisar al padre, o reabrir si no se puede cerrar
    const alCerrar = () => { if (onCloseRef.current) onCloseRef.current(); else d.showModal(); };
    d.addEventListener('cancel', alCancelar);
    d.addEventListener('close', alCerrar);
    return () => {
      d.removeEventListener('cancel', alCancelar);
      d.removeEventListener('close', alCerrar);
      d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal-dialog ${className}`}
      style={style}
      aria-labelledby={labelledBy}
      closedby={cerrarAlClicFuera ? 'any' : 'closerequest'}
    >
      {children}
    </dialog>
  );
}
