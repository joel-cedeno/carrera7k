import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ErrorApi } from '../shared/inscripcion.ts';
import type { Config } from './config.ts';

const MAX_CUERPO = 16 * 1024;

export class ErrorSolicitud extends Error {
  readonly status: number;
  readonly cuerpo: ErrorApi;

  constructor(status: number, cuerpo: ErrorApi) {
    super(cuerpo.mensaje);
    this.status = status;
    this.cuerpo = cuerpo;
  }
}

export function enviarJson(res: ServerResponse, status: number, cuerpo: unknown, cabeceras: Record<string, string | string[]> = {}): void {
  const json = JSON.stringify(cuerpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    ...cabeceras,
  });
  res.end(json);
}

export function leerJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
      reject(new ErrorSolicitud(415, { error: 'solicitud', mensaje: 'Se esperaba JSON.' }));
      return;
    }
    let tamaño = 0;
    const partes: Buffer[] = [];
    req.on('data', (parte: Buffer) => {
      tamaño += parte.length;
      if (tamaño > MAX_CUERPO) {
        reject(new ErrorSolicitud(413, { error: 'solicitud', mensaje: 'La solicitud es demasiado grande.' }));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8')));
      } catch {
        reject(new ErrorSolicitud(400, { error: 'solicitud', mensaje: 'JSON inválido.' }));
      }
    });
    req.on('error', reject);
  });
}

/** Lee un campo de texto de un cuerpo JSON desconocido (recortado y con longitud máxima). */
export function textoDe(cuerpo: unknown, clave: string, max = 300): string {
  const o = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;
  const valor = o[clave];
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

/** Límite simple por clave (IP, usuario…) en ventana fija, en memoria (suficiente para una sola instancia). */
export function crearLimitador(maximo: number, ventanaMs: number) {
  const registros = new Map<string, { cuenta: number; desde: number }>();
  const limpieza = setInterval(() => {
    const ahora = Date.now();
    for (const [clave, r] of registros) if (ahora - r.desde > ventanaMs) registros.delete(clave);
  }, ventanaMs);
  limpieza.unref();

  return (clave: string): boolean => {
    const ahora = Date.now();
    const r = registros.get(clave);
    if (!r || ahora - r.desde > ventanaMs) {
      registros.set(clave, { cuenta: 1, desde: ahora });
      return true;
    }
    r.cuenta++;
    return r.cuenta <= maximo;
  };
}

/** Cuenta solo fallos (p. ej. contraseñas incorrectas) por clave, en ventana fija desde el primer fallo. */
export function crearContadorFallos(maximo: number, ventanaMs: number) {
  const fallos = new Map<string, { cuenta: number; desde: number }>();
  const limpieza = setInterval(() => {
    const ahora = Date.now();
    for (const [clave, r] of fallos) if (ahora - r.desde > ventanaMs) fallos.delete(clave);
  }, ventanaMs);
  limpieza.unref();

  const vigente = (clave: string) => {
    const r = fallos.get(clave);
    return r && Date.now() - r.desde <= ventanaMs ? r : undefined;
  };

  return {
    bloqueado: (clave: string): boolean => (vigente(clave)?.cuenta ?? 0) >= maximo,
    fallo(clave: string): void {
      const r = vigente(clave);
      if (r) r.cuenta++;
      else fallos.set(clave, { cuenta: 1, desde: Date.now() });
    },
  };
}

/**
 * IP del visitante. Detrás de un proxy de confianza (TRUST_PROXY=1) se usa la ÚLTIMA entrada de
 * X-Forwarded-For: es la que añadió el proxy. Las anteriores las puede escribir el propio visitante.
 */
export function ipDe(req: IncomingMessage, config: Config): string {
  const reenviada = req.headers['x-forwarded-for'];
  if (config.confiarProxy && typeof reenviada === 'string') {
    const ultima = reenviada.split(',').map((p) => p.trim()).filter(Boolean).pop();
    if (ultima) return ultima;
  }
  return req.socket.remoteAddress ?? 'desconocida';
}

/** true si la petición pasó por un proxy cuya información no se considera de confianza. */
export const viaProxyNoConfiable = (req: IncomingMessage, config: Config): boolean =>
  !config.confiarProxy && req.headers['x-forwarded-for'] !== undefined;

/** true si la petición llegó por HTTPS (directo o a través del proxy de confianza). */
export function esHttps(req: IncomingMessage, config: Config): boolean {
  if ('encrypted' in req.socket && req.socket.encrypted) return true;
  return config.confiarProxy && req.headers['x-forwarded-proto'] === 'https';
}

/**
 * Defensa CSRF para rutas con cookie: si el navegador envía Origin, debe ser el mismo sitio.
 * (La cookie ya es SameSite=Strict y el API exige JSON; esto es una capa más.)
 */
export function exigirMismoOrigen(req: IncomingMessage, config: Config): void {
  const origen = req.headers.origin;
  if (!origen) return;
  const host = (config.confiarProxy && typeof req.headers['x-forwarded-host'] === 'string'
    ? req.headers['x-forwarded-host']
    : req.headers.host) ?? '';
  let mismo = false;
  try {
    mismo = new URL(origen).host === host;
  } catch {
    mismo = false;
  }
  if (!mismo) throw new ErrorSolicitud(403, { error: 'solicitud', mensaje: 'Origen no permitido.' });
}

export function leerCookies(req: IncomingMessage): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i < 1) continue;
    const nombre = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    try {
      mapa.set(nombre, decodeURIComponent(valor));
    } catch {
      // cookie mal formada: se ignora
    }
  }
  return mapa;
}
