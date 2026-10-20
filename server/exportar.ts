/**
 * Exporta las inscripciones a CSV (compatible con Excel).
 *   npm run exportar                 → data/exportaciones/inscripciones-AAAAMMDD-HHMM.csv
 *   npm run exportar -- --separador=";"
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { abrirBaseDeDatos, codigoDesdeId, type FilaExportacion } from './db.ts';

const COLUMNAS: Array<[keyof FilaExportacion, string]> = [
  ['codigo', 'Código'],
  ['fecha_inscripcion', 'Fecha de inscripción'],
  ['nombres', 'Nombres'],
  ['apellidos', 'Apellidos'],
  ['documento', 'Cédula / pasaporte'],
  ['fecha_nacimiento', 'Fecha de nacimiento'],
  ['edad', 'Edad'],
  ['genero', 'Género'],
  ['telefono', 'Teléfono'],
  ['correo', 'Correo'],
  ['emerg_nombre', 'Contacto de emergencia'],
  ['emerg_parentesco', 'Parentesco / relación'],
  ['emerg_telefono', 'Teléfono de emergencia'],
  ['autoriza_fotos', 'Autoriza fotos/videos'],
  ['creado_en', 'Registrado (UTC)'],
];

const separador = process.argv.find((a) => a.startsWith('--separador='))?.split('=')[1] || ',';

function celda(valor: string | number): string {
  let texto = String(valor);
  // Evita que Excel interprete el contenido como fórmula (inyección CSV).
  if (/^[=@\t\r]/.test(texto) || /^[+-](?!\d)/.test(texto)) texto = `'${texto}`;
  return /["\n\r]/.test(texto) || texto.includes(separador) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

if (!fs.existsSync(config.dbPath)) {
  console.error(`No existe la base de datos en ${config.dbPath}`);
  process.exit(1);
}

const db = abrirBaseDeDatos(config.dbPath);
const filas = db.listar();
// Validación de boletos: una columna por punto de control con la fecha (UTC) y el moderador.
const ingresos = new Map<string, string>();
for (const i of db.listarIngresos()) ingresos.set(`${codigoDesdeId(i.inscripcion_id)}|${i.punto}`, `${i.registrado_en} (${i.moderador})`);
db.cerrar();

const lineas = [
  [...COLUMNAS.map(([, titulo]) => titulo), ...config.puntosControl.map((p) => `Ingreso: ${p.nombre}`)]
    .map(celda)
    .join(separador),
  ...filas.map((f) =>
    [
      ...COLUMNAS.map(([clave]) => celda(f[clave])),
      ...config.puntosControl.map((p) => celda(ingresos.get(`${f.codigo}|${p.id}`) ?? '')),
    ].join(separador),
  ),
];

const marca = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const destino = path.resolve('data/exportaciones', `inscripciones-${marca}.csv`);
fs.mkdirSync(path.dirname(destino), { recursive: true });
// BOM para que Excel reconozca UTF-8 (tildes y ñ).
fs.writeFileSync(destino, '﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
console.info(`${filas.length} inscripciones exportadas a ${destino}`);
