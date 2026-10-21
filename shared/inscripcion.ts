/**
 * Modelo y reglas de la ficha de inscripción.
 * Se comparte entre el navegador (validación inmediata) y el servidor (validación definitiva).
 *
 * Fuentes: ficha de inscripción (docx) y documento de la carrera (PDF, 5.1 Participantes).
 */

/** Rango de edad SUGERIDO (documento de la carrera, 5.1). No impide inscribirse: solo se avisa. */
export const EDAD_MIN = 13;
export const EDAD_MAX = 69;
/** Límite de cordura para detectar fechas mal escritas (p. ej. 1026 en lugar de 2026). */
const EDAD_LIMITE = 110;
export const ZONA_HORARIA = 'America/Guayaquil';

/** Datos que envía la persona. La fecha de inscripción y la edad las fija el servidor. */
export interface InscripcionEntrada {
  nombres: string;
  apellidos: string;
  documento: string;
  fechaNacimiento: string;
  genero: string;
  telefono: string;
  correo: string;
  emergNombre: string;
  emergParentesco: string;
  emergTelefono: string;
  aceptaDeclaracion: boolean;
  autorizaFotos: boolean;
}

export interface Inscripcion extends InscripcionEntrada {
  codigo: string;
  fechaInscripcion: string;
  edad: number;
}

export type CampoValidado =
  | 'nombres'
  | 'apellidos'
  | 'documento'
  | 'fechaNacimiento'
  | 'telefono'
  | 'correo'
  | 'emergNombre'
  | 'emergParentesco'
  | 'emergTelefono'
  | 'aceptaDeclaracion';

export const CAMPOS_VALIDADOS: readonly CampoValidado[] = [
  'nombres',
  'apellidos',
  'documento',
  'fechaNacimiento',
  'telefono',
  'correo',
  'emergNombre',
  'emergParentesco',
  'emergTelefono',
  'aceptaDeclaracion',
];

export type Errores = Partial<Record<CampoValidado, string>>;

/** Estado público de las inscripciones, difundido en tiempo real. */
export type EstadoInscripciones = 'abiertas' | 'proximamente' | 'cerradas' | 'agotadas';

export interface Estado {
  estado: EstadoInscripciones;
  total: number;
  inscritos: number;
  disponibles: number;
  /** ISO 8601, o null si no hay fecha configurada. */
  inicio: string | null;
  fin: string | null;
  /** Hora del servidor (ms) para corregir el reloj del navegador. */
  ahora: number;
  /** Sitio en modo demostración (MODO_DEMO=1): las páginas avisan que nada de lo que se registra es real. */
  demo: boolean;
}

/** Respuesta de error del API. */
export interface ErrorApi {
  error:
    | 'validacion'
    | 'duplicado'
    | EstadoInscripciones
    | 'limite'
    | 'solicitud'
    | 'interno'
    | 'autenticacion'
    | 'no_encontrado';
  mensaje: string;
  campos?: Errores;
}

const LONGITUD_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_RE = /^\+?[\d\s()-]{7,15}$/;
const DOCUMENTO_RE = /^[A-Za-z0-9-]{5,20}$/;

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del evento, sin depender del reloj local del equipo. */
export function hoyISO(ahora: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(ahora);
}

function parseISO(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  const valida = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return valida ? { y, m, d } : null;
}

/** Edad en años cumplidos a la fecha de referencia; null si alguna fecha no es válida o es posterior. */
export function calcularEdad(fechaNacimiento: string, referencia: string): number | null {
  const nac = parseISO(fechaNacimiento);
  const ref = parseISO(referencia);
  if (!nac || !ref) return null;
  if (fechaNacimiento > referencia) return null;
  let edad = ref.y - nac.y;
  if (ref.m < nac.m || (ref.m === nac.m && ref.d < nac.d)) edad--;
  return edad;
}

/** Formato dd/mm/aaaa para mostrar. */
export function formatearFecha(iso: string): string {
  const p = parseISO(iso);
  if (!p) return iso;
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
}

/** Normaliza el documento para comparar duplicados: sin espacios ni puntos, en mayúsculas. */
export function normalizarDocumento(valor: string): string {
  return valor.replace(/[\s.]/g, '').toUpperCase();
}

const requerido = (v: string, mensaje: string): string | undefined => (v.trim() ? undefined : mensaje);
const longitud = (v: string): string | undefined =>
  v.trim().length > LONGITUD_MAX ? `Máximo ${LONGITUD_MAX} caracteres.` : undefined;

type Validador = (v: InscripcionEntrada, referencia: string) => string | undefined;

const validadores: Record<CampoValidado, Validador> = {
  nombres: (v) => requerido(v.nombres, 'Ingresa tus nombres completos.') ?? longitud(v.nombres),
  apellidos: (v) => requerido(v.apellidos, 'Ingresa tus apellidos completos.') ?? longitud(v.apellidos),
  documento: (v) =>
    requerido(v.documento, 'Ingresa tu cédula o pasaporte.') ??
    (DOCUMENTO_RE.test(normalizarDocumento(v.documento))
      ? undefined
      : 'Usa solo letras, números o guiones (entre 5 y 20 caracteres).'),
  fechaNacimiento: (v, referencia) => {
    if (!v.fechaNacimiento) return 'Ingresa tu fecha de nacimiento.';
    const edad = calcularEdad(v.fechaNacimiento, referencia);
    if (edad === null || edad > EDAD_LIMITE) return 'La fecha de nacimiento no es válida.';
    return undefined;
  },
  telefono: (v) =>
    requerido(v.telefono, 'Ingresa un teléfono de contacto.') ??
    (TELEFONO_RE.test(v.telefono.trim()) ? undefined : 'Ingresa un teléfono válido.'),
  correo: (v) =>
    requerido(v.correo, 'Ingresa tu correo.') ??
    longitud(v.correo) ??
    (EMAIL_RE.test(v.correo.trim()) ? undefined : 'Ingresa un correo válido.'),
  emergNombre: (v) =>
    requerido(v.emergNombre, 'Ingresa el nombre del contacto de emergencia.') ?? longitud(v.emergNombre),
  emergParentesco: (v) =>
    requerido(v.emergParentesco, 'Indica el parentesco o la relación.') ?? longitud(v.emergParentesco),
  emergTelefono: (v) =>
    requerido(v.emergTelefono, 'Ingresa el teléfono del contacto de emergencia.') ??
    (TELEFONO_RE.test(v.emergTelefono.trim()) ? undefined : 'Ingresa un teléfono válido.'),
  aceptaDeclaracion: (v) =>
    v.aceptaDeclaracion ? undefined : 'Debes aceptar la declaración y autorización para inscribirte.',
};

/**
 * Aviso (no error) si la edad está fuera del rango sugerido. La inscripción se permite igual.
 * undefined si la edad está dentro del rango o la fecha aún no es válida.
 */
export function avisoEdad(fechaNacimiento: string, referencia: string): string | undefined {
  const edad = calcularEdad(fechaNacimiento, referencia);
  if (edad === null || edad > EDAD_LIMITE) return undefined;
  if (edad >= EDAD_MIN && edad <= EDAD_MAX) return undefined;
  return `La edad sugerida para participar es de ${EDAD_MIN} a ${EDAD_MAX} años. Puedes inscribirte igualmente.`;
}

export function validarCampo(campo: CampoValidado, valores: InscripcionEntrada, referencia: string): string | undefined {
  return validadores[campo](valores, referencia);
}

export function validarInscripcion(valores: InscripcionEntrada, referencia: string): Errores {
  const errores: Errores = {};
  for (const campo of CAMPOS_VALIDADOS) {
    const mensaje = validarCampo(campo, valores, referencia);
    if (mensaje) errores[campo] = mensaje;
  }
  return errores;
}

/** Convierte un cuerpo JSON desconocido en una entrada saneada (recorta textos, fuerza tipos). */
export function sanearEntrada(cuerpo: unknown): InscripcionEntrada {
  const o = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;
  const texto = (k: string): string => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  return {
    nombres: texto('nombres'),
    apellidos: texto('apellidos'),
    documento: texto('documento'),
    fechaNacimiento: texto('fechaNacimiento'),
    genero: texto('genero').slice(0, LONGITUD_MAX),
    telefono: texto('telefono'),
    correo: texto('correo').toLowerCase(),
    emergNombre: texto('emergNombre'),
    emergParentesco: texto('emergParentesco'),
    emergTelefono: texto('emergTelefono'),
    aceptaDeclaracion: o['aceptaDeclaracion'] === true,
    autorizaFotos: o['autorizaFotos'] === true,
  };
}
