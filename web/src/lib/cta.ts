import type { EstadoInscripciones } from '../../../shared/inscripcion.ts';
import { todos } from './dom.ts';

const TEXTO_NO_DISPONIBLE: Partial<Record<EstadoInscripciones, string>> = {
  proximamente: 'Inscripciones próximamente',
  cerradas: 'Inscripciones cerradas',
  agotadas: 'Cupos agotados',
};

/** Ajusta los botones de inscripción [data-cta] según el estado de las inscripciones. */
export function montarBotonesInscripcion() {
  const botones = todos<HTMLAnchorElement>('[data-cta]').map((boton) => {
    const etiqueta = boton.querySelector<HTMLElement>('.btn__label') ?? boton;
    const original = etiqueta.textContent ?? '';
    boton.addEventListener('click', (e) => {
      if (boton.getAttribute('aria-disabled') === 'true') e.preventDefault();
    });
    return { boton, etiqueta, original };
  });

  return {
    actualizar(estado: EstadoInscripciones): void {
      const texto = TEXTO_NO_DISPONIBLE[estado];
      for (const { boton, etiqueta, original } of botones) {
        boton.classList.toggle('is-disabled', Boolean(texto));
        if (texto) boton.setAttribute('aria-disabled', 'true');
        else boton.removeAttribute('aria-disabled');
        // El botón pequeño de la barra superior conserva su texto corto.
        etiqueta.textContent = texto && !boton.classList.contains('btn--sm') ? texto : original;
      }
    },
  };
}
