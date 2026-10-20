import { rutaVerificacion } from '../../../shared/boleto.ts';
import { generarQr } from '../../../shared/qr.ts';

/** Datos que muestra el boleto. Sin cédula: el boleto se puede compartir o fotografiar. */
export interface DatosBoleto {
  codigo: string;
  nombres: string;
  apellidos: string;
  boleto: string;
  /** Dirección del QR fijada por el servidor (URL_PUBLICA). Sin ella se usa la dirección actual del sitio. */
  url?: string | null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const EVENTO = {
  titulo: 'Carrera Atlética 7K',
  lema: 'Únete contra la violencia a la mujer',
  fecha: 'Domingo 15 de noviembre de 2026 · 7h00',
  lugar: 'Av. Río Amazonas y Jorge Washington · Quito',
  indicacion: 'Presenta este boleto y tu cédula de identidad.',
};

/**
 * Dirección completa que va dentro del QR. Preferencia: la dirección pública que fija el servidor
 * (no cambia aunque se abra el sitio desde otra dirección); si no está definida, la del sitio actual.
 */
const urlDe = (datos: DatosBoleto): string => datos.url ?? new URL(rutaVerificacion(datos.boleto), document.baseURI).href;

/**
 * Corrección de errores Q (25 %): el boleto se sigue leyendo con la pantalla rayada,
 * con brillo o impreso y arrugado.
 */
const NIVEL_QR = 'Q';

/** Dibuja el QR dentro de un <svg> (solo atributos: compatible con la CSP sin estilos en línea). */
export function dibujarQr(svg: SVGSVGElement, texto: string): void {
  const { lado, trazado } = generarQr(texto, NIVEL_QR);
  svg.setAttribute('viewBox', `0 0 ${lado} ${lado}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const fondo = document.createElementNS(SVG_NS, 'rect');
  fondo.setAttribute('width', String(lado));
  fondo.setAttribute('height', String(lado));
  fondo.setAttribute('fill', '#ffffff');
  const modulos = document.createElementNS(SVG_NS, 'path');
  modulos.setAttribute('d', trazado);
  modulos.setAttribute('fill', '#000000');
  svg.replaceChildren(fondo, modulos);
}

/**
 * Rellena un bloque de boleto del HTML:
 *   [data-boleto-qr] (svg) · [data-boleto-nombre] · [data-boleto-codigo] · [data-boleto-descargar] (botón)
 */
export function montarBoleto(raiz: HTMLElement, datos: DatosBoleto): void {
  const url = urlDe(datos);
  const svg = raiz.querySelector<SVGSVGElement>('[data-boleto-qr]');
  if (svg) {
    dibujarQr(svg, url);
    svg.setAttribute('aria-label', `Código QR del boleto ${datos.codigo}`);
  }
  const nombre = raiz.querySelector('[data-boleto-nombre]');
  if (nombre) nombre.textContent = `${datos.nombres} ${datos.apellidos}`;
  const codigo = raiz.querySelector('[data-boleto-codigo]');
  if (codigo) codigo.textContent = datos.codigo;

  const boton = raiz.querySelector<HTMLButtonElement>('[data-boleto-descargar]');
  if (boton) {
    boton.onclick = () => {
      boton.disabled = true;
      descargarBoleto(datos)
        .catch(() => window.alert('No se pudo generar la imagen. Puedes tomar una captura de pantalla del boleto.'))
        .finally(() => {
          boton.disabled = false;
        });
    };
  }
}

// ── Imagen descargable (PNG) ──────────────────────────────────────

const LOGO_PROPORCION = 160.2 / 214.8; // alto / ancho del viewBox del logo

/**
 * Carga el logo para el lienzo. El SVG no declara width/height (Firefox no lo dibuja así):
 * se le añaden y se usa como data: URL (la CSP permite img-src data:, no blob:).
 */
async function cargarLogo(ancho: number): Promise<HTMLImageElement> {
  const res = await fetch(new URL('assets/marca/logo-7k-unete.svg', document.baseURI));
  if (!res.ok) throw new Error('Logo no disponible');
  const svg = (await res.text()).replace('<svg ', `<svg width="${ancho}" height="${Math.round(ancho * LOGO_PROPORCION)}" `);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Ajusta el tamaño de letra para que el texto quepa en el ancho dado. */
function textoAjustado(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, ancho: number, peso: string, tamaño: number, familia: string): void {
  let t = tamaño;
  ctx.font = `${peso} ${t}px ${familia}`;
  while (ctx.measureText(texto).width > ancho && t > 20) {
    t -= 2;
    ctx.font = `${peso} ${t}px ${familia}`;
  }
  ctx.fillText(texto, x, y);
}

/** Genera el boleto como imagen PNG (1080 × 1600) y lo descarga. Útil para guardarlo en la galería. */
export async function descargarBoleto(datos: DatosBoleto): Promise<void> {
  const W = 1080;
  const H = 1600;
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');

  await Promise.allSettled([
    document.fonts.load('700 48px Metropolis'),
    document.fonts.load('400 32px Metropolis'),
    document.fonts.load('900 64px Poppins'),
  ]);
  const logo = await cargarLogo(420).catch(() => null);

  const sans = 'Metropolis, system-ui, sans-serif';
  const display = 'Poppins, Metropolis, system-ui, sans-serif';

  // Fondo de marca
  const fondo = ctx.createLinearGradient(0, 0, 0, H);
  fondo.addColorStop(0, '#3a0a78');
  fondo.addColorStop(0.45, '#290055');
  fondo.addColorStop(1, '#1b0039');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Logo
  if (logo) {
    const lw = 420;
    ctx.drawImage(logo, (W - lw) / 2, 70, lw, lw * LOGO_PROPORCION);
  }

  ctx.fillStyle = '#fcc40d';
  ctx.font = `700 34px ${sans}`;
  ctx.fillText('BOLETO DE INSCRIPCIÓN', W / 2, 470);

  // Nombre y código
  ctx.fillStyle = '#ffffff';
  textoAjustado(ctx, `${datos.nombres} ${datos.apellidos}`, W / 2, 545, W - 140, '700', 52, sans);
  ctx.fillStyle = '#fcc40d';
  ctx.font = `900 76px ${display}`;
  ctx.fillText(datos.codigo, W / 2, 640);

  // QR sobre tarjeta blanca
  const { lado, modulos } = generarQr(urlDe(datos), NIVEL_QR);
  const tarjeta = 640;
  const tx = (W - tarjeta) / 2;
  const ty = 700;
  ctx.fillStyle = '#ffffff';
  // roundRect: Safari 16+; antes, esquinas rectas.
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(tx, ty, tarjeta, tarjeta, 32);
    ctx.fill();
  } else {
    ctx.fillRect(tx, ty, tarjeta, tarjeta);
  }
  const celda = Math.floor((tarjeta - 40) / lado);
  const origen = tx + (tarjeta - celda * lado) / 2;
  const origenY = ty + (tarjeta - celda * lado) / 2;
  ctx.fillStyle = '#000000';
  modulos.forEach((fila, y) =>
    fila.forEach((oscuro, x) => {
      if (oscuro) ctx.fillRect(origen + x * celda, origenY + y * celda, celda, celda);
    }),
  );

  // Evento
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 36px ${sans}`;
  ctx.fillText(EVENTO.fecha, W / 2, 1420);
  ctx.fillStyle = '#dccff3';
  ctx.font = `400 30px ${sans}`;
  ctx.fillText(EVENTO.lugar, W / 2, 1470);
  ctx.fillText(EVENTO.indicacion, W / 2, 1530);

  const blob = await new Promise<Blob | null>((resolve) => lienzo.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se pudo crear la imagen');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `boleto-${datos.codigo}.png`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
}

export { EVENTO };
