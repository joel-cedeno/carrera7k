import { pulsar, todos } from './dom.ts';
import { ahora } from './reloj.ts';

const UNIDADES = [
  ['dias', 86_400_000],
  ['horas', 3_600_000],
  ['minutos', 60_000],
  ['segundos', 1_000],
] as const;

/** Cuentas regresivas [data-countdown="<ISO>"], actualizadas en el borde de cada segundo. */
export function montarCuentasRegresivas(): void {
  for (const raiz of todos('[data-countdown]')) {
    const objetivo = new Date(raiz.dataset.countdown ?? '').getTime();
    if (Number.isNaN(objetivo)) continue;

    const valores = UNIDADES.map(([unidad]) => raiz.querySelector<HTMLElement>(`[data-unit="${unidad}"]`));
    let primera = true;

    const pintar = (): void => {
      let restante = objetivo - ahora();
      if (restante <= 0) {
        raiz.hidden = true;
        return;
      }
      raiz.hidden = false;

      UNIDADES.forEach(([, ms], i) => {
        const el = valores[i];
        const valor = Math.floor(restante / ms);
        restante -= valor * ms;
        if (!el) return;
        const texto = String(valor).padStart(2, '0');
        if (el.textContent !== texto) {
          el.textContent = texto;
          if (!primera && el.parentElement) pulsar(el.parentElement, 'is-tick', 600);
        }
      });
      primera = false;

      // Se agenda al siguiente cambio de segundo para que todos los relojes avancen a la vez.
      window.setTimeout(pintar, 1000 - (ahora() % 1000) + 10);
    };

    pintar();
  }
}
