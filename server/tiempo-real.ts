import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Estado, EstadoInscripciones } from '../shared/inscripcion.ts';
import type { Config } from './config.ts';

/** Calcula el estado público a partir del conteo y la ventana de inscripción. */
export function calcularEstado(inscritos: number, config: Config, ahora = new Date()): Estado {
  const { totalCupos: total, inicio, fin } = config;
  let estado: EstadoInscripciones = 'abiertas';
  if (inicio && ahora < inicio) estado = 'proximamente';
  else if (inscritos >= total) estado = 'agotadas';
  else if (fin && ahora > fin) estado = 'cerradas';

  return {
    estado,
    total,
    inscritos,
    disponibles: Math.max(0, total - inscritos),
    inicio: inicio?.toISOString() ?? null,
    fin: fin?.toISOString() ?? null,
    ahora: ahora.getTime(),
    demo: config.modoDemo,
  };
}

const LATIDO_MS = 25_000;

/**
 * Difusión del estado por Server-Sent Events: una conexión HTTP abierta por visitante,
 * sin dependencias ni WebSockets. El navegador reconecta solo si se corta.
 */
export function crearCanalTiempoReal(maxConexiones: number) {
  const clientes = new Set<ServerResponse>();

  const latido = setInterval(() => {
    for (const res of clientes) res.write(': ping\n\n');
  }, LATIDO_MS);
  latido.unref();

  const mensaje = (estado: Estado): string => `event: estado\ndata: ${JSON.stringify(estado)}\n\n`;

  return {
    get conexiones(): number {
      return clientes.size;
    },

    /** Devuelve false si se alcanzó el máximo de conexiones (el cliente usará sondeo). */
    suscribir(req: IncomingMessage, res: ServerResponse, estadoInicial: Estado): boolean {
      if (clientes.size >= maxConexiones) return false;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 5000\n\n');
      res.write(mensaje(estadoInicial));
      clientes.add(res);
      req.on('close', () => clientes.delete(res));
      return true;
    },

    difundir(estado: Estado): void {
      const datos = mensaje(estado);
      for (const res of clientes) res.write(datos);
    },

    cerrar(): void {
      clearInterval(latido);
      for (const res of clientes) res.end();
      clientes.clear();
    },
  };
}

export type CanalTiempoReal = ReturnType<typeof crearCanalTiempoReal>;
