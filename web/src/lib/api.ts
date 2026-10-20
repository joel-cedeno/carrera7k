import type { ErrorApi, Estado, Inscripcion, InscripcionEntrada } from '../../../shared/inscripcion.ts';
import { sincronizarReloj } from './reloj.ts';

const SONDEO_MS = 15_000;

export async function obtenerEstado(): Promise<Estado> {
  const res = await fetch('api/estado', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Estado no disponible (${res.status})`);
  const estado = (await res.json()) as Estado;
  sincronizarReloj(estado.ahora);
  return estado;
}

export type ResultadoEnvio =
  | { ok: true; inscripcion: Inscripcion; boleto: string; url: string | null; estado: Estado }
  | { ok: false; status: number; error: ErrorApi };

export async function enviarInscripcion(datos: InscripcionEntrada): Promise<ResultadoEnvio> {
  const res = await fetch('api/inscripciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(datos),
  });
  const cuerpo: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const { inscripcion, boleto, url, estado } = cuerpo as {
      inscripcion: Inscripcion;
      boleto: string;
      url: string | null;
      estado: Estado;
    };
    sincronizarReloj(estado.ahora);
    return { ok: true, inscripcion, boleto, url: url ?? null, estado };
  }
  const error =
    cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo
      ? (cuerpo as ErrorApi)
      : { error: 'interno' as const, mensaje: 'Ocurrió un error inesperado. Intenta nuevamente.' };
  return { ok: false, status: res.status, error };
}

export interface Suscripcion {
  cancelar(): void;
}

/**
 * Recibe el estado de cupos en tiempo real (Server-Sent Events).
 * Si el canal no está disponible, cae a sondeo periódico. Al volver a la pestaña, refresca al instante.
 */
export function suscribirEstado(alRecibir: (estado: Estado) => void, alPerderConexion: () => void): Suscripcion {
  let fuente: EventSource | null = null;
  let sondeo: number | undefined;

  const recibir = (estado: Estado): void => {
    sincronizarReloj(estado.ahora);
    alRecibir(estado);
  };

  const consultar = (): void => {
    obtenerEstado().then(recibir, alPerderConexion);
  };

  const iniciarSondeo = (): void => {
    if (sondeo !== undefined) return;
    consultar();
    sondeo = window.setInterval(consultar, SONDEO_MS);
  };

  if ('EventSource' in window) {
    fuente = new EventSource('api/estado/stream');
    fuente.addEventListener('estado', (e) => recibir(JSON.parse((e as MessageEvent<string>).data) as Estado));
    fuente.addEventListener('error', () => {
      alPerderConexion();
      // CLOSED: el servidor rechazó la conexión (p. ej. límite alcanzado); el navegador ya no reintentará.
      if (fuente?.readyState === EventSource.CLOSED) iniciarSondeo();
    });
  } else {
    iniciarSondeo();
  }

  const alCambiarVisibilidad = (): void => {
    if (document.visibilityState === 'visible') consultar();
  };
  document.addEventListener('visibilitychange', alCambiarVisibilidad);

  return {
    cancelar() {
      fuente?.close();
      if (sondeo !== undefined) window.clearInterval(sondeo);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    },
  };
}
