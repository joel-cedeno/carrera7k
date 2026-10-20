import { movimientoReducido, todos } from './dom.ts';

const INTERVALO_ROTADOR_MS = 4500;

/** Activa los estilos que dependen de JavaScript (p. ej. aparición al hacer scroll). */
export function marcarJs(): void {
  document.documentElement.classList.add('js');
}

/** [data-reveal] y [data-reveal-stagger] reciben .is-visible al entrar en pantalla. */
export function montarApariciones(): void {
  for (const contenedor of todos('[data-reveal-stagger]')) {
    Array.from(contenedor.children).forEach((hijo, i) => (hijo as HTMLElement).style.setProperty('--reveal-i', String(i)));
  }

  const elementos = todos('[data-reveal], [data-reveal-stagger]');
  if (movimientoReducido() || !('IntersectionObserver' in window)) {
    elementos.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        entrada.target.classList.add('is-visible');
        observador.unobserve(entrada.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
  );
  elementos.forEach((el) => observador.observe(el));
}

/** Barra superior compacta al hacer scroll. */
export function montarBarraSuperior(): void {
  const barra = document.querySelector<HTMLElement>('[data-topbar]');
  if (!barra) return;
  let pendiente = false;
  const revisar = (): void => {
    pendiente = false;
    barra.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!pendiente) {
        pendiente = true;
        requestAnimationFrame(revisar);
      }
    },
    { passive: true },
  );
  revisar();
}

/**
 * Menú de secciones en pantallas angostas: el botón de la barra abre y cierra la misma <nav>.
 * Se cierra al elegir una sección, con Escape, al tocar fuera o al pasar a escritorio.
 */
export function montarMenuMovil(): void {
  const boton = document.querySelector<HTMLButtonElement>('[data-topbar-menu]');
  const nav = document.querySelector<HTMLElement>('[data-topbar-nav]');
  if (!boton || !nav) return;
  const escritorio = window.matchMedia('(min-width: 64rem)');

  const abierto = (): boolean => boton.getAttribute('aria-expanded') === 'true';
  const cambiar = (abrir: boolean): void => {
    boton.setAttribute('aria-expanded', String(abrir));
    nav.classList.toggle('is-open', abrir);
  };

  boton.addEventListener('click', () => cambiar(!abierto()));
  nav.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) cambiar(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && abierto()) {
      cambiar(false);
      boton.focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (abierto() && !nav.contains(e.target as Node) && !boton.contains(e.target as Node)) cambiar(false);
  });
  escritorio.addEventListener('change', () => cambiar(false));
}

/** Resalta en el menú la sección visible. */
export function montarSeccionActiva(): void {
  const enlaces = todos<HTMLAnchorElement>('[data-topbar] nav a[href^="#"]');
  const secciones = enlaces
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter((s): s is HTMLElement => s !== null);
  if (!secciones.length || !('IntersectionObserver' in window)) return;

  const activar = (id: string | null): void => {
    for (const a of enlaces) {
      const activo = a.hash === `#${id}`;
      a.classList.toggle('is-active', activo);
      if (activo) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };

  // Franja central de la pantalla: la sección que la cruza es la activa.
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) if (e.isIntersecting) activar(e.target.id);
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  secciones.forEach((s) => observador.observe(s));
}

/** Rota los mensajes de campaña. Se detiene con el puntero/foco encima, en segundo plano o con movimiento reducido. */
export function montarRotadores(): void {
  for (const rotador of todos('[data-rotator]')) {
    const items = todos('.rotator__item', rotador);
    if (items.length < 2 || movimientoReducido()) continue;

    let actual = Math.max(0, items.findIndex((i) => i.classList.contains('is-current')));
    let pausado = false;
    items.forEach((item, i) => item.setAttribute('aria-hidden', String(i !== actual)));

    const pausar = (valor: boolean) => () => {
      pausado = valor;
      rotador.classList.toggle('is-paused', valor);
    };
    rotador.addEventListener('pointerenter', pausar(true));
    rotador.addEventListener('pointerleave', pausar(false));
    rotador.addEventListener('focusin', pausar(true));
    rotador.addEventListener('focusout', pausar(false));

    window.setInterval(() => {
      if (pausado || document.hidden) return;
      items[actual]!.classList.remove('is-current');
      items[actual]!.setAttribute('aria-hidden', 'true');
      actual = (actual + 1) % items.length;
      items[actual]!.classList.add('is-current');
      items[actual]!.setAttribute('aria-hidden', 'false');
    }, INTERVALO_ROTADOR_MS);
  }
}
