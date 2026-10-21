import type { Estado } from '../../../shared/inscripcion.ts';
import { obtenerEstado } from './api.ts';

/**
 * Modo demostración (MODO_DEMO=1 en el servidor): franja visible en todas las páginas y
 * «boleto de prueba» en la imagen descargable, para que nada se confunda con lo real.
 */
let demo = false;

export const esDemo = (): boolean => demo;

/** Muestra la franja si el estado indica modo demostración. Se puede llamar varias veces. */
export function aplicarModoDemo(estado: Pick<Estado, 'demo'>): void {
  if (!estado.demo || demo) return;
  demo = true;
  document.documentElement.classList.add('es-demo');

  const franja = document.createElement('div');
  franja.className = 'aviso-demo';
  franja.setAttribute('role', 'note');
  const titulo = document.createElement('strong');
  titulo.textContent = 'Versión de demostración.';
  franja.append(
    titulo,
    ' Esta página es una vista previa: las inscripciones y los boletos generados aquí son de prueba y no son válidos para la carrera.',
  );
  document.body.prepend(franja);
}

/** Para páginas que no reciben el estado en tiempo real (lector, «Mi boleto»): una sola consulta. */
export function consultarModoDemo(): void {
  obtenerEstado().then(aplicarModoDemo, () => undefined);
}
