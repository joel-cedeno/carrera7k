import path from 'node:path';

function entero(nombre: string, porDefecto: number): number {
  const valor = process.env[nombre];
  if (valor === undefined || valor === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${nombre} debe ser un entero positivo (recibido: "${valor}")`);
  return n;
}

function fecha(nombre: string): Date | null {
  const valor = process.env[nombre];
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new Error(`${nombre} no es una fecha ISO 8601 válida (recibido: "${valor}")`);
  return d;
}

/**
 * Puntos de control del día del evento: `id:Nombre visible`, separados por coma.
 * Por defecto, la entrega del kit (documento de la carrera) y el ingreso a la salida.
 */
function puntosControl(): Array<{ id: string; nombre: string }> {
  const valor = process.env.PUNTOS_CONTROL?.trim() || 'kit:Entrega de kit,salida:Ingreso a la salida';
  const puntos = valor.split(',').map((parte) => {
    const [id = '', ...resto] = parte.split(':');
    return { id: id.trim(), nombre: resto.join(':').trim() || id.trim() };
  });
  for (const p of puntos) {
    if (!/^[a-z0-9_-]{1,32}$/.test(p.id)) {
      throw new Error(`PUNTOS_CONTROL: id inválido "${p.id}" (usa minúsculas, números, - o _)`);
    }
  }
  if (new Set(puntos.map((p) => p.id)).size !== puntos.length) throw new Error('PUNTOS_CONTROL: hay ids repetidos');
  return puntos;
}

/** Dirección pública del sitio, normalizada con «/» final para resolver rutas relativas. */
function urlPublica(): string | null {
  const valor = process.env.URL_PUBLICA?.trim();
  if (!valor) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`URL_PUBLICA no es una dirección válida (recibido: "${valor}")`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('URL_PUBLICA debe empezar por https://');
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

const raiz = process.cwd();

export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: entero('PORT', 5173),
  /** Archivo SQLite. Debe estar en un disco persistente. */
  dbPath: path.resolve(raiz, process.env.DB_PATH ?? 'data/inscripciones.db'),
  webDir: path.resolve(raiz, 'web'),
  /** Cupos totales (disposición de la Viceministra, 20-10-2026: 2.000; el documento original decía 1.500). */
  totalCupos: entero('TOTAL_CUPOS', 2000),
  /** Ventana de inscripción opcional. Sin valores, las inscripciones quedan abiertas. */
  inicio: fecha('INSCRIPCIONES_INICIO'),
  fin: fecha('INSCRIPCIONES_FIN'),
  /** Inscripciones permitidas por IP en la ventana de tiempo (oficinas pueden compartir IP). */
  limitePorIp: entero('LIMITE_INSCRIPCIONES_IP', 30),
  ventanaLimiteMs: entero('LIMITE_VENTANA_MIN', 10) * 60_000,
  /** Detrás de un proxy (nginx, etc.): usar X-Forwarded-For para la IP real. */
  confiarProxy: process.env.TRUST_PROXY === '1',
  maxConexionesTiempoReal: entero('MAX_CONEXIONES_SSE', 5000),
  /**
   * La clave que firma los boletos vive en la base de datos. Este archivo (PEM Ed25519) solo se usa
   * para importarla la primera vez, p. ej. al migrar a un servidor nuevo con una base de datos vacía.
   */
  claveBoletosImportar: path.resolve(raiz, process.env.BOLETOS_CLAVE ?? 'data/boletos-ed25519.pem'),
  puntosControl: puntosControl(),
  /** Duración de la sesión de un moderador. */
  sesionMs: entero('SESION_HORAS', 12) * 3_600_000,
  /** Dirección pública del sitio (para el QR impreso). Opcional: aún no está definida. */
  urlPublica: urlPublica(),
  /** Vista previa para el cliente: todas las páginas muestran que es una demostración. */
  modoDemo: process.env.MODO_DEMO === '1',
} as const;

export type Config = typeof config;
