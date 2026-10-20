/**
 * Genera el código QR que lleva al sitio, para afiches, redes y pantallas.
 *   npm run qr-sitio -- --url=https://dominio-oficial/          (o URL_PUBLICA en .env)
 *   npm run qr-sitio -- --url=https://dominio-oficial/inscripcion --color=#290055
 *
 * Salida: data/qr/qr-sitio.svg (vectorial: se escala sin perder calidad para imprenta).
 * Corrección de errores H (30 %): sigue leyéndose con el logo de la carrera encima, si
 * este no tapa más de ~15 % de la superficie y no toca las tres esquinas de posición.
 */
import fs from 'node:fs';
import path from 'node:path';
import { qrComoSvg } from '../shared/qr.ts';
import { config } from './config.ts';

const argumento = (nombre: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);

const url = argumento('url') ?? config.urlPublica;
const color = argumento('color') ?? '#000000';

if (!url) {
  console.error('Falta la dirección pública. Usa --url=https://… o define URL_PUBLICA en .env.');
  process.exit(1);
}

let destino: URL;
try {
  destino = new URL(url);
} catch {
  console.error(`"${url}" no es una dirección válida.`);
  process.exit(1);
}
if (destino.protocol !== 'https:') console.warn('Aviso: la dirección no es HTTPS. Para publicar, usa la dirección definitiva con HTTPS.');
if (!/^#[0-9a-f]{6}$/i.test(color)) {
  console.error('--color debe ser un hexadecimal de 6 cifras, p. ej. #290055 (oscuro sobre fondo blanco).');
  process.exit(1);
}

const archivo = path.resolve('data/qr/qr-sitio.svg');
fs.mkdirSync(path.dirname(archivo), { recursive: true });
fs.writeFileSync(archivo, qrComoSvg(destino.href, 'H', color), 'utf8');
console.info(`QR de ${destino.href} → ${archivo}`);
