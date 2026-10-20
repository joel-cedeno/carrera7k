import crypto from 'node:crypto';
import fs from 'node:fs';
import { mensajeToken, separarToken } from '../shared/boleto.ts';
import type { BaseDeDatos } from './db.ts';

const AJUSTE_CLAVE = 'boletos_clave_privada';

export type VerificacionToken =
  | { ok: true; id: number; version: number }
  | { ok: false; motivo: 'firma' };

/** Huella corta de la clave pública, para reconocerla en registros y diagnósticos. */
const huella = (publica: crypto.KeyObject): string =>
  crypto.createHash('sha256').update(publica.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);

function leerArchivo(archivo: string | null): string | null {
  if (!archivo) return null;
  try {
    return fs.readFileSync(archivo, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function aClavePrivada(pem: string, origen: string): crypto.KeyObject {
  const clave = crypto.createPrivateKey(pem);
  if (clave.asymmetricKeyType !== 'ed25519') throw new Error(`${origen} no contiene una clave Ed25519`);
  return clave;
}

/**
 * Firma y verifica los tokens de los boletos con Ed25519.
 *
 * Integridad a largo plazo:
 *  - La clave privada se guarda DENTRO de la base de datos (tabla `ajustes`): un respaldo de la base
 *    de datos siempre incluye su clave; no pueden separarse ni perderse por separado.
 *  - Nunca se reemplaza: si ya existe, se usa. Si el archivo de importación trae otra clave distinta,
 *    el servidor NO arranca (evita invalidar en silencio todos los boletos emitidos).
 *  - Al arrancar se comprueba que firmar y verificar funcionan.
 */
export function cargarFirmaBoletos(db: BaseDeDatos, archivoImportacion: string | null) {
  const pemArchivo = leerArchivo(archivoImportacion);
  let pem = db.ajuste(AJUSTE_CLAVE);

  if (pem && pemArchivo) {
    const enBase = crypto.createPublicKey(aClavePrivada(pem, 'La base de datos'));
    const enArchivo = crypto.createPublicKey(aClavePrivada(pemArchivo, archivoImportacion!));
    if (huella(enBase) !== huella(enArchivo)) {
      throw new Error(
        `La clave de boletos de ${archivoImportacion} (${huella(enArchivo)}) no coincide con la guardada en la base de datos ` +
          `(${huella(enBase)}). Se conserva la de la base de datos; retira o corrige ese archivo para arrancar.`,
      );
    }
  } else if (!pem) {
    if (pemArchivo) {
      aClavePrivada(pemArchivo, archivoImportacion!);
      pem = pemArchivo;
      console.info(`  Clave de boletos importada de ${archivoImportacion} a la base de datos.`);
    } else {
      const { privateKey } = crypto.generateKeyPairSync('ed25519');
      pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      console.info('  Clave de boletos creada y guardada en la base de datos.');
    }
    // Si otro proceso la guardó a la vez, gana la que ya estaba.
    if (!db.guardarAjusteNuevo(AJUSTE_CLAVE, pem)) pem = db.ajuste(AJUSTE_CLAVE)!;
  }

  const privada = aClavePrivada(pem, 'La base de datos');
  const publica = crypto.createPublicKey(privada);

  const firmar = (id: number, version: number): string => {
    const mensaje = mensajeToken(id, version);
    return `${mensaje}.${crypto.sign(null, Buffer.from(mensaje), privada).toString('base64url')}`;
  };

  /** Solo comprueba la firma. Que la inscripción exista y la versión sea la vigente lo decide quien llama. */
  const verificar = (token: string): VerificacionToken => {
    const partes = separarToken(token);
    if (!partes) return { ok: false, motivo: 'firma' };
    const firma = Buffer.from(partes.firma, 'base64url');
    // Base64url canónico: una sola escritura válida por firma (sin variantes equivalentes).
    if (firma.length !== 64 || firma.toString('base64url') !== partes.firma) return { ok: false, motivo: 'firma' };
    if (!crypto.verify(null, Buffer.from(partes.mensaje), publica, firma)) return { ok: false, motivo: 'firma' };
    return { ok: true, id: partes.id, version: partes.version };
  };

  // Autocomprobación al arrancar.
  const prueba = verificar(firmar(1, 1));
  if (!prueba.ok || prueba.id !== 1) throw new Error('La clave de boletos no supera la autocomprobación de firma.');

  return {
    firmar,
    verificar,
    huella: huella(publica),
    /** Para una futura validación sin conexión en el lector. */
    clavePublicaPem: publica.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export type FirmaBoletos = ReturnType<typeof cargarFirmaBoletos>;
