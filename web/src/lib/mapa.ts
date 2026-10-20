/**
 * Mapa animado del recorrido (sección «El día de la carrera»).
 *
 * - Leaflet + mapa base de OpenStreetMap: libre, sin clave de API ni cuenta de facturación.
 * - Se carga solo cuando la sección se acerca a la pantalla (la landing no paga su peso al abrir).
 * - Animación: el trazado se dibuja de la salida a la llegada, aparecen los kilómetros y la
 *   hidratación, y una corredora recorre la ruta en bucle. Con movimiento reducido: todo estático.
 * - El mapa no captura el desplazamiento de la página (sin zoom con la rueda ni arrastre con un dedo).
 */
import { movimientoReducido } from './dom.ts';

const KM_TOTALES = 7;
/** Puntos de hidratación (documento de la carrera): kilómetros 3, 5 y 7. */
const KM_HIDRATACION = [3, 5, 7];
const DIBUJO_MS = 2600;
const VUELTA_MS = 16_000;

type Punto = readonly [number, number];

/** Distancia en metros entre dos coordenadas (haversine). */
function metros(a: Punto, b: Punto): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Recorre la ruta por distancia: posición en una fracción (0–1) y tramo recorrido hasta ella. */
function crearRecorrido(ruta: readonly Punto[]) {
  const acumulado = [0];
  for (let i = 1; i < ruta.length; i++) acumulado.push(acumulado[i - 1]! + metros(ruta[i - 1]!, ruta[i]!));
  const total = acumulado[acumulado.length - 1]!;

  const posicion = (fraccion: number): { punto: [number, number]; indice: number } => {
    const objetivo = Math.min(Math.max(fraccion, 0), 1) * total;
    let i = 1;
    while (i < ruta.length - 1 && acumulado[i]! < objetivo) i++;
    const a = ruta[i - 1]!;
    const b = ruta[i]!;
    const tramo = acumulado[i]! - acumulado[i - 1]! || 1;
    const t = (objetivo - acumulado[i - 1]!) / tramo;
    return { punto: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], indice: i };
  };

  const hasta = (fraccion: number): Array<[number, number]> => {
    const { punto, indice } = posicion(fraccion);
    return [...ruta.slice(0, indice).map((p) => [p[0], p[1]] as [number, number]), punto];
  };

  return { posicion, hasta };
}

async function construirMapa(contenedor: HTMLElement): Promise<void> {
  const [{ default: L }, { RUTA_7K }] = await Promise.all([import('leaflet'), import('./ruta-7k.ts')]);
  const recorrido = crearRecorrido(RUTA_7K);
  const estatico = movimientoReducido();
  const tactil = window.matchMedia('(pointer: coarse)').matches;

  contenedor.querySelector('[data-mapa-aviso]')?.remove();
  const lienzo = document.createElement('div');
  lienzo.className = 'mapa__lienzo';
  contenedor.prepend(lienzo);

  const mapa = L.map(lienzo, {
    scrollWheelZoom: false,
    dragging: !tactil,
    touchZoom: true,
    zoomSnap: 0.25,
    attributionControl: true,
  });
  mapa.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  }).addTo(mapa);

  const limites = L.latLngBounds(RUTA_7K.map((p) => [p[0], p[1]] as [number, number]));
  const encuadrar = (): void => {
    mapa.fitBounds(limites, { padding: [28, 28] });
  };
  encuadrar();
  // El contenedor cambia de tamaño con la ventana (dos columnas ↔ una).
  new ResizeObserver(() => {
    mapa.invalidateSize();
  }).observe(lienzo);

  // Trazado: base tenue + progreso animado.
  L.polyline(RUTA_7K.map((p) => [p[0], p[1]] as [number, number]), { className: 'mapa__ruta-base', interactive: false }).addTo(mapa);
  const progreso = L.polyline([], { className: 'mapa__ruta', interactive: false }).addTo(mapa);

  const icono = (clase: string, html: string, tamaño: [number, number]) =>
    L.divIcon({ className: `mapa__marca ${clase}`, html, iconSize: tamaño, iconAnchor: [tamaño[0] / 2, tamaño[1] / 2] });

  const marcas: Array<{ fraccion: number; marca: ReturnType<typeof L.marker> }> = [];
  const agregar = (fraccion: number, clase: string, html: string, tamaño: [number, number], titulo: string): void => {
    const marca = L.marker(recorrido.posicion(fraccion).punto, {
      icon: icono(clase, html, tamaño),
      keyboard: false,
      title: titulo,
      interactive: false,
    });
    marcas.push({ fraccion, marca });
  };

  agregar(0, 'mapa__marca--salida', '<span>Salida</span>', [64, 26], 'Salida: Av. Río Amazonas y Jorge Washington');
  for (let km = 1; km < KM_TOTALES; km++) {
    const agua = KM_HIDRATACION.includes(km);
    agregar(km / KM_TOTALES, agua ? 'mapa__marca--km mapa__marca--agua' : 'mapa__marca--km', `<span>${km}</span>`, [26, 26], `Kilómetro ${km}${agua ? ' · hidratación' : ''}`);
  }
  agregar(1, 'mapa__marca--llegada mapa__marca--agua', '<span>Llegada</span>', [70, 26], 'Llegada: Parque Bicentenario · hidratación');

  const corredora = L.marker(recorrido.posicion(0).punto, {
    icon: icono('mapa__corredora', '', [16, 16]),
    keyboard: false,
    interactive: false,
  });

  const mostrarHasta = (fraccion: number): void => {
    progreso.setLatLngs(recorrido.hasta(fraccion));
    for (const m of marcas) if (m.fraccion <= fraccion + 1e-6 && !mapa.hasLayer(m.marca)) m.marca.addTo(mapa);
  };

  if (estatico) {
    mostrarHasta(1);
    return;
  }

  // 1) Dibujo del trazado (al entrar en pantalla)  2) corredora en bucle, solo mientras el mapa está a la vista.
  const suave = (t: number): number => 1 - (1 - t) ** 3;
  let inicio = 0;
  let visible = false;
  let empezado = false;
  let corriendo = false;
  let cuadro = 0;

  const correr = (ahora: number): void => {
    if (!visible) {
      corriendo = false;
      return;
    }
    inicio ||= ahora;
    corredora.setLatLng(recorrido.posicion(((ahora - inicio) % VUELTA_MS) / VUELTA_MS).punto);
    cuadro = requestAnimationFrame(correr);
  };

  const dibujar = (ahora: number): void => {
    inicio ||= ahora;
    const t = Math.min((ahora - inicio) / DIBUJO_MS, 1);
    mostrarHasta(suave(t));
    if (t < 1) {
      cuadro = requestAnimationFrame(dibujar);
      return;
    }
    corredora.addTo(mapa);
    inicio = 0;
    corriendo = true;
    cuadro = requestAnimationFrame(correr);
  };

  mostrarHasta(0);
  new IntersectionObserver(
    ([entrada]) => {
      visible = Boolean(entrada?.isIntersecting);
      if (!visible) return;
      if (!empezado) {
        empezado = true;
        cuadro = requestAnimationFrame(dibujar);
      } else if (!corriendo && mapa.hasLayer(corredora)) {
        corriendo = true;
        cancelAnimationFrame(cuadro);
        cuadro = requestAnimationFrame(correr);
      }
    },
    { threshold: 0.35 },
  ).observe(lienzo);
}

/** Monta el mapa cuando su sección se acerca a la pantalla. */
export function montarMapa(): void {
  const contenedor = document.querySelector<HTMLElement>('[data-mapa]');
  if (!contenedor) return;

  const cargar = (): void => {
    construirMapa(contenedor).catch(() => {
      const aviso = contenedor.querySelector('[data-mapa-aviso]');
      if (aviso) aviso.textContent = 'No se pudo cargar el mapa. El recorrido se describe debajo.';
    });
  };

  if (!('IntersectionObserver' in window)) {
    cargar();
    return;
  }
  const observador = new IntersectionObserver(
    (entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        observador.disconnect();
        cargar();
      }
    },
    { rootMargin: '400px 0px' },
  );
  observador.observe(contenedor);
}
