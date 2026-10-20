export function porId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} no encontrado`);
  return el as T;
}

export function todos<T extends Element = HTMLElement>(selector: string, raiz: ParentNode = document): T[] {
  return Array.from(raiz.querySelectorAll<T>(selector));
}

const consultaMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

export function movimientoReducido(): boolean {
  return consultaMovimiento.matches;
}

/** Añade una clase temporal; si ya estaba, reinicia la animación. */
export function pulsar(el: Element, clase: string, duracionMs: number): void {
  el.classList.remove(clase);
  void (el as HTMLElement).offsetWidth; // fuerza reflow para reiniciar la animación CSS
  el.classList.add(clase);
  window.setTimeout(() => el.classList.remove(clase), duracionMs);
}

/** 2000 → "2.000" (formato del documento de la carrera). */
export function formatearNumero(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const formatoFechaHora = new Intl.DateTimeFormat('es-EC', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Guayaquil',
});

export function formatearFechaHora(iso: string): string {
  return formatoFechaHora.format(new Date(iso));
}
