import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

/** Rutas limpias opcionales: /inscripcion → inscripcion.html */
const ALIAS: Record<string, string> = {
  '/': '/index.html',
  '/inscripcion': '/inscripcion.html',
  '/verificar': '/verificar.html',
  '/boleto': '/boleto.html',
};

/** Sirve archivos de `raiz` con ETag y sin permitir salir del directorio. Devuelve false si no existe. */
export function servirEstatico(raiz: string, req: IncomingMessage, res: ServerResponse, ruta: string): boolean {
  let relativa: string;
  try {
    relativa = decodeURIComponent(ALIAS[ruta] ?? ruta);
  } catch {
    return false;
  }
  if (relativa.includes('\0')) return false;

  const archivo = path.join(raiz, path.normalize(relativa));
  if (!archivo.startsWith(raiz + path.sep)) return false;
  // No exponer archivos ocultos ni documentación interna de assets.
  if (path.basename(archivo).startsWith('.') || archivo.endsWith('.md')) return false;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(archivo);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(archivo).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const cabeceras: Record<string, string> = {
    'Content-Type': TIPOS[ext] ?? 'application/octet-stream',
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
    // Los nombres de archivo no llevan hash: se revalida siempre con ETag (304 si no cambió).
    // Excepción: fuentes, que no cambian.
    'Cache-Control': ext === '.woff2' || ext === '.woff' ? 'public, max-age=604800' : 'no-cache',
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, cabeceras);
    res.end();
    return true;
  }

  res.writeHead(200, { ...cabeceras, 'Content-Length': String(stat.size) });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(archivo).pipe(res);
  return true;
}
