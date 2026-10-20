/**
 * Boleto de inscripción con QR y validación el día del evento.
 * Se comparte entre el navegador y el servidor.
 *
 * Contenido del QR: una dirección del propio sitio, `…/verificar#t=<token>`.
 *  - Con la cámara normal del celular abre la consulta pública del boleto.
 *  - El lector de moderadores extrae el token de la dirección (o acepta el token solo).
 *  - El token va en el fragmento (#): el navegador no lo envía al servidor al abrir la página.
 *
 * Token = texto firmado + «.» + firma Ed25519 (64 bytes, base64url canónico):
 *   7K1.<n.º de inscripción>.<firma>              boleto original (versión 1)
 *   7K2.<n.º de inscripción>.<versión>.<firma>    boleto reemitido (versión ≥ 2; anula los anteriores)
 * La firma la emite el servidor con su clave privada: no se puede falsificar ni adivinar
 * cambiando el número. Los formatos no caducan: el servidor acepta siempre todos los anteriores.
 * Con la clave pública también se podría validar sin conexión.
 */

const TOKEN_V1 = /^(7K1\.([1-9]\d{0,8}))\.([A-Za-z0-9_-]{86})$/;
const TOKEN_V2 = /^(7K2\.([1-9]\d{0,8})\.([2-9]|[1-9]\d{1,3}))\.([A-Za-z0-9_-]{86})$/;

export interface PartesToken {
  id: number;
  /** Versión del boleto: sube al reemitirlo. */
  version: number;
  /** Texto firmado. */
  mensaje: string;
  firma: string;
}

export function separarToken(token: string): PartesToken | null {
  const v1 = TOKEN_V1.exec(token);
  if (v1) return { id: Number(v1[2]), version: 1, mensaje: v1[1]!, firma: v1[3]! };
  const v2 = TOKEN_V2.exec(token);
  if (v2) return { id: Number(v2[2]), version: Number(v2[3]), mensaje: v2[1]!, firma: v2[4]! };
  return null;
}

/** Texto que se firma para una inscripción y una versión de boleto. */
export const mensajeToken = (id: number, version: number): string =>
  version === 1 ? `7K1.${id}` : `7K2.${id}.${version}`;

/** Obtiene el token de lo que se haya leído en un QR: la dirección completa o el token solo. */
export function extraerToken(leido: string): string | null {
  const texto = leido.trim();
  if (separarToken(texto)) return texto;
  const m = /[#&?]t=([^&#\s]+)/.exec(texto);
  if (!m) return null;
  let token: string;
  try {
    token = decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
  return separarToken(token) ? token : null;
}

/** Ruta relativa de verificación de un boleto (el navegador la completa con su dirección). */
export const rutaVerificacion = (token: string): string => `verificar#t=${token}`;

/** Por qué un boleto no es válido (el detalle solo se muestra al moderador). */
export type MotivoInvalido = 'firma' | 'inexistente' | 'reemplazado';

/** «7K-0001», «7k 1», «0001» o «1» → 1. null si no es un código. */
export function idDesdeCodigo(texto: string): number | null {
  const m = /^(?:7K[\s-]?)?0*([1-9]\d{0,8})$/i.exec(texto.trim());
  return m ? Number(m[1]) : null;
}

export const codigoDesdeId = (id: number | bigint): string => `7K-${String(id).padStart(4, '0')}`;

/** «0000005678» → «••••••5678». Para que el moderador coteje con la cédula sin exponerla completa. */
export function enmascararDocumento(documento: string): string {
  const visibles = 4;
  if (documento.length <= visibles) return documento;
  return '•'.repeat(Math.min(documento.length - visibles, 8)) + documento.slice(-visibles);
}

// ── Respuestas del API ────────────────────────────────────────────

/** Consulta pública: sin datos personales. */
export type VerificacionPublica = { valido: true; codigo: string } | { valido: false };

/** Boleto recuperado por la persona inscrita (cédula + fecha de nacimiento). */
export interface BoletoRecuperado {
  codigo: string;
  nombres: string;
  apellidos: string;
  boleto: string;
  /** Dirección completa del QR si el servidor conoce su dirección pública (URL_PUBLICA); si no, null. */
  url: string | null;
}

export interface PuntoControl {
  id: string;
  nombre: string;
}

export interface Moderador {
  usuario: string;
  nombre: string;
}

export interface SesionModerador {
  moderador: Moderador;
  puntos: PuntoControl[];
}

/** Lo que ve el moderador para cotejar con el documento de identidad. */
export interface Participante {
  codigo: string;
  nombres: string;
  apellidos: string;
  documento: string; // enmascarado
  edad: number;
  genero: string;
}

export interface IngresoRegistrado {
  punto: string;
  fecha: string; // ISO 8601
  moderador: string;
}

export interface ConsultaModerador {
  participante: Participante;
  ingresos: IngresoRegistrado[];
}

/** Minutos durante los que un moderador puede deshacer un registro que hizo por error. */
export const MINUTOS_PARA_DESHACER = 10;

export interface ResultadoIngreso extends ConsultaModerador {
  /** false: ya estaba registrado en ese punto (boleto usado). */
  nuevo: boolean;
}

export interface ResumenControl {
  inscritos: number;
  puntos: Array<PuntoControl & { ingresos: number }>;
}
