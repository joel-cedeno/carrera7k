import type { Estado, EstadoInscripciones } from '../../../shared/inscripcion.ts';
import { formatearFechaHora, formatearNumero, movimientoReducido, pulsar, todos } from './dom.ts';

export type EstadoVisual = EstadoInscripciones | 'cargando' | 'desconectado';

const ETIQUETAS: Record<EstadoVisual, string> = {
  cargando: 'Conectando…',
  abiertas: 'Inscripciones abiertas · en vivo',
  proximamente: 'Inscripciones próximamente',
  cerradas: 'Inscripciones cerradas',
  agotadas: 'Cupos agotados',
  desconectado: 'Reconectando…',
};

/** Proporción de cupos restantes a partir de la cual se destaca la urgencia. */
const UMBRAL_BAJO = 0.1;
const DURACION_CONTEO_MS = 1200;
const INTERVALO_ANUNCIO_MS = 10_000;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

interface Widget {
  raiz: HTMLElement;
  numero: HTMLElement | null;
  total: HTMLElement | null;
  etiqueta: HTMLElement | null;
  barra: HTMLElement | null;
  plazo: HTMLElement | null;
  anuncio: HTMLElement | null;
  mostrado: number | null;
  animacion: number;
}

function animarNumero(w: Widget, destino: number): void {
  cancelAnimationFrame(w.animacion);
  const origen = w.mostrado ?? destino;
  w.mostrado = destino;
  if (!w.numero) return;
  if (origen === destino || movimientoReducido()) {
    w.numero.textContent = formatearNumero(destino);
    return;
  }
  const inicio = performance.now();
  const paso = (t: number): void => {
    const avance = Math.min(1, (t - inicio) / DURACION_CONTEO_MS);
    w.numero!.textContent = formatearNumero(origen + (destino - origen) * easeOutCubic(avance));
    if (avance < 1) w.animacion = requestAnimationFrame(paso);
  };
  w.animacion = requestAnimationFrame(paso);
}

function textoPlazo(estado: Estado): string {
  if (estado.estado === 'proximamente' && estado.inicio) return `Abren el ${formatearFechaHora(estado.inicio)}`;
  if (estado.estado === 'abiertas' && estado.fin) return `Cierran el ${formatearFechaHora(estado.fin)}`;
  return '';
}

/** Conecta todos los widgets [data-cupos] de la página. */
export function montarCupos() {
  const widgets: Widget[] = todos('[data-cupos]').map((raiz) => ({
    raiz,
    numero: raiz.querySelector('[data-cupos-disponibles]'),
    total: raiz.querySelector('[data-cupos-total]'),
    etiqueta: raiz.querySelector('[data-cupos-estado]'),
    barra: raiz.querySelector('[data-cupos-barra]'),
    plazo: raiz.querySelector('[data-cupos-plazo]'),
    anuncio: raiz.querySelector('[data-cupos-anuncio]'),
    mostrado: null,
    animacion: 0,
  }));

  let ultimoAnuncio = 0;
  let anuncioPendiente: number | undefined;

  const anunciar = (w: Widget, texto: string): void => {
    if (!w.anuncio) return;
    // Los lectores de pantalla no deben recibir cada cambio: como máximo un aviso cada 10 s.
    window.clearTimeout(anuncioPendiente);
    const espera = Math.max(0, ultimoAnuncio + INTERVALO_ANUNCIO_MS - Date.now());
    anuncioPendiente = window.setTimeout(() => {
      w.anuncio!.textContent = texto;
      ultimoAnuncio = Date.now();
    }, espera);
  };

  const marcarEstado = (w: Widget, estado: EstadoVisual): void => {
    w.raiz.dataset.estado = estado;
    if (w.etiqueta) w.etiqueta.textContent = ETIQUETAS[estado];
  };

  return {
    actualizar(estado: Estado): void {
      for (const w of widgets) {
        const anterior = w.mostrado;
        // Primera carga: la cifra "baja" desde el total hasta los cupos disponibles.
        if (anterior === null) w.mostrado = estado.total;
        animarNumero(w, estado.disponibles);
        if (anterior !== null && anterior !== estado.disponibles) {
          pulsar(w.raiz, 'is-bump', 900);
          anunciar(w, `Quedan ${formatearNumero(estado.disponibles)} cupos disponibles.`);
        }

        marcarEstado(w, estado.estado);
        if (w.total) w.total.textContent = formatearNumero(estado.total);
        w.raiz.style.setProperty('--progress', String(estado.total ? estado.inscritos / estado.total : 0));
        w.raiz.classList.toggle(
          'is-bajo',
          estado.estado === 'abiertas' && estado.disponibles <= estado.total * UMBRAL_BAJO,
        );

        if (w.barra) {
          w.barra.setAttribute('aria-valuemax', String(estado.total));
          w.barra.setAttribute('aria-valuenow', String(estado.inscritos));
          w.barra.setAttribute(
            'aria-valuetext',
            `${formatearNumero(estado.inscritos)} de ${formatearNumero(estado.total)} cupos ocupados`,
          );
        }

        if (w.plazo) {
          const texto = textoPlazo(estado);
          w.plazo.textContent = texto;
          w.plazo.hidden = !texto;
        }
      }
    },

    desconectado(): void {
      for (const w of widgets) if (w.mostrado !== null) marcarEstado(w, 'desconectado');
    },
  };
}
