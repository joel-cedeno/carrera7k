import type {
  BoletoRecuperado,
  ConsultaModerador,
  ResultadoIngreso,
  ResumenControl,
  SesionModerador,
  VerificacionPublica,
} from '../../../shared/boleto.ts';
import type { ErrorApi } from '../../../shared/inscripcion.ts';

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; status: number; error: ErrorApi };

const SIN_CONEXION: ErrorApi = {
  error: 'interno',
  mensaje: 'No pudimos conectar con el servidor. Revisa la conexión e intenta nuevamente.',
};

async function pedir<T>(ruta: string, metodo: 'GET' | 'POST' | 'DELETE' = 'GET', cuerpo?: unknown): Promise<Respuesta<T>> {
  let res: Response;
  try {
    res = await fetch(ruta, {
      method: metodo,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: cuerpo === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    return { ok: false, status: 0, error: SIN_CONEXION };
  }
  if (res.status === 204) return { ok: true, datos: undefined as T };
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, datos: json as T };
  const error =
    json && typeof json === 'object' && 'error' in json
      ? (json as ErrorApi)
      : { error: 'interno' as const, mensaje: 'Ocurrió un error inesperado. Intenta nuevamente.' };
  return { ok: false, status: res.status, error };
}

export const verificarBoleto = (token: string) => pedir<VerificacionPublica>('api/boletos/verificar', 'POST', { token });

export const recuperarBoleto = (documento: string, fechaNacimiento: string) =>
  pedir<BoletoRecuperado>('api/boletos/recuperar', 'POST', { documento, fechaNacimiento });

export const sesionActual = () => pedir<SesionModerador>('api/moderacion/sesion');

export const iniciarSesion = (usuario: string, clave: string) =>
  pedir<SesionModerador>('api/moderacion/sesion', 'POST', { usuario, clave });

export const cerrarSesion = () => pedir<void>('api/moderacion/sesion', 'DELETE');

export const consultarBoleto = (token: string) => pedir<ConsultaModerador>('api/moderacion/consultar', 'POST', { token });

export const buscarInscripcion = (busqueda: string) =>
  pedir<ConsultaModerador>('api/moderacion/consultar', 'POST', { busqueda });

export const registrarIngreso = (codigo: string, punto: string) =>
  pedir<ResultadoIngreso>('api/moderacion/ingresos', 'POST', { codigo, punto });

export const deshacerIngreso = (codigo: string, punto: string) =>
  pedir<ConsultaModerador>('api/moderacion/ingresos/deshacer', 'POST', { codigo, punto });

export const resumenControl = () => pedir<ResumenControl>('api/moderacion/resumen');
