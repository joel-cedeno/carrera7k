import http from 'node:http';
import { crearApi, enviarJson } from './api.ts';
import { cargarFirmaBoletos } from './boletos.ts';
import { config } from './config.ts';
import { abrirBaseDeDatos } from './db.ts';
import { servirEstatico } from './estaticos.ts';
import { crearCanalTiempoReal } from './tiempo-real.ts';

const CABECERAS_SEGURIDAD: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // Mapa del recorrido: teselas de OpenStreetMap.
    "img-src 'self' data: https://tile.openstreetmap.org",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const db = abrirBaseDeDatos(config.dbPath);
const canal = crearCanalTiempoReal(config.maxConexionesTiempoReal);
const firma = cargarFirmaBoletos(db, config.claveBoletosImportar);
const api = crearApi(config, db, canal, firma);

/** Solo el lector de boletos puede usar la cámara. */
const PAGINAS_CON_CAMARA = new Set(['/verificar', '/verificar.html']);

const servidor = http.createServer(async (req, res) => {
  for (const [nombre, valor] of Object.entries(CABECERAS_SEGURIDAD)) res.setHeader(nombre, valor);

  const ruta = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (PAGINAS_CON_CAMARA.has(ruta)) res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');

  if (await api.manejar(req, res, ruta)) return;

  if ((req.method === 'GET' || req.method === 'HEAD') && servirEstatico(config.webDir, req, res, ruta)) return;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    enviarJson(res, 405, { error: 'solicitud', mensaje: 'Método no permitido.' });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Página no encontrada');
});

servidor.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${config.port} ya está en uso. Detén el otro proceso o define otro PORT en .env.`);
  } else {
    console.error('[servidor]', error);
  }
  db.cerrar();
  process.exit(1);
});

servidor.listen(config.port, config.host, () => {
  const ventana = [config.inicio?.toISOString(), config.fin?.toISOString()].filter(Boolean).join(' → ') || 'sin restricción';
  console.info(`Carrera 7K · http://${config.host}:${config.port}`);
  console.info(`  Base de datos: ${config.dbPath} (${db.contar()}/${config.totalCupos} inscritos)`);
  console.info(`  Ventana de inscripción: ${ventana}`);
  console.info(`  Puntos de control: ${config.puntosControl.map((p) => p.nombre).join(' · ')}`);
  console.info(`  Boletos: firma Ed25519 ${firma.huella} · QR → ${config.urlPublica ?? 'dirección desde la que se abre el sitio (define URL_PUBLICA)'}`);
  const moderadores = db.moderadores().filter((m) => m.activo === 1);
  console.info(`  Moderadores activos: ${moderadores.length}${moderadores.length ? '' : ' (crea uno con: npm run moderadores -- agregar <usuario>)'}`);
  for (const m of moderadores.filter((m) => m.demo === 1)) {
    console.warn(`  ⚠ Cuenta de demostración activa: "${m.usuario}" (solo entra desde este equipo o la red local). Elimínala antes de publicar: npm run moderadores -- eliminar ${m.usuario}`);
  }
});

function apagar(senal: string): void {
  console.info(`\n${senal} recibido, cerrando…`);
  api.cerrar();
  canal.cerrar();
  servidor.close(() => {
    db.cerrar();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
