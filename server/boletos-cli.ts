/**
 * Mantenimiento de boletos.
 *   npm run boletos -- verificar "<token o dirección leída del QR>"   diagnóstico completo de un boleto
 *   npm run boletos -- reemitir 7K-0001     anula el boleto vigente (p. ej. si se publicó en redes o se
 *                                           lo robaron). La persona obtiene el nuevo en «Mi boleto».
 *   npm run boletos -- clave                huella y clave pública de firma (para auditoría o validación sin conexión)
 */
import { codigoDesdeId, extraerToken, idDesdeCodigo, separarToken } from '../shared/boleto.ts';
import { cargarFirmaBoletos } from './boletos.ts';
import { config } from './config.ts';
import { abrirBaseDeDatos } from './db.ts';

const [accion, argumento = ''] = process.argv.slice(2);
const db = abrirBaseDeDatos(config.dbPath);
const firma = cargarFirmaBoletos(db, config.claveBoletosImportar);

function salir(mensaje: string, codigo = 1): never {
  (codigo ? console.error : console.info)(mensaje);
  db.cerrar();
  process.exit(codigo);
}

switch (accion) {
  case 'verificar': {
    const token = extraerToken(argumento);
    if (!token) salir('No es un boleto de la Carrera 7K (formato desconocido).');
    const partes = separarToken(token)!;
    const v = firma.verificar(token);
    console.info(`Inscripción ${codigoDesdeId(partes.id)} · versión del boleto ${partes.version}`);
    if (!v.ok) salir('✗ Firma NO válida: no lo emitió esta plataforma o fue alterado.');
    console.info('✓ Firma auténtica');
    const p = db.participante(partes.id);
    if (!p) salir('✗ La inscripción no existe.');
    if (p.boletoVersion !== partes.version) salir(`✗ Boleto anulado: la versión vigente es la ${p.boletoVersion}.`);
    const ingresos = db.ingresosDe(partes.id);
    console.info(`✓ Vigente · ${p.nombres} ${p.apellidos}`);
    for (const i of ingresos) console.info(`  ingreso «${i.punto}»: ${i.registrado_en} (${i.moderador})`);
    break;
  }
  case 'reemitir': {
    const id = idDesdeCodigo(argumento);
    if (id === null) salir('Indica el código de inscripción. Ejemplo: npm run boletos -- reemitir 7K-0001');
    const version = db.reemitirBoleto(id);
    if (version === null) salir(`No existe la inscripción ${codigoDesdeId(id)}.`);
    console.info(`Boleto de ${codigoDesdeId(id)} reemitido (versión ${version}). Los anteriores ya no son válidos.`);
    console.info('La persona descarga el nuevo en «Mi boleto» (/boleto) con su cédula y fecha de nacimiento.');
    break;
  }
  case 'clave':
    console.info(`Huella: ${firma.huella}\n${firma.clavePublicaPem}`);
    break;
  default:
    salir('Uso: npm run boletos -- <verificar "<token o URL>" | reemitir <código> | clave>');
}

db.cerrar();
