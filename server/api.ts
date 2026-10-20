import type { IncomingMessage, ServerResponse } from 'node:http';
import { rutaVerificacion } from '../shared/boleto.ts';
import { calcularEdad, hoyISO, sanearEntrada, validarInscripcion, type Estado } from '../shared/inscripcion.ts';
import type { FirmaBoletos } from './boletos.ts';
import type { Config } from './config.ts';
import type { BaseDeDatos } from './db.ts';
import { ErrorSolicitud, crearLimitador, enviarJson, ipDe as ipDeSolicitud, leerJson } from './http.ts';
import { crearApiModeracion } from './moderacion.ts';
import { calcularEstado, type CanalTiempoReal } from './tiempo-real.ts';

export { enviarJson };

const MENSAJES_ESTADO = {
  proximamente: 'Las inscripciones aún no están abiertas. Las fechas se comunicarán por los canales oficiales.',
  cerradas: 'El período de inscripción ha finalizado.',
  agotadas: 'Se completaron todos los cupos disponibles.',
} as const;

export function crearApi(config: Config, db: BaseDeDatos, canal: CanalTiempoReal, firma: FirmaBoletos) {
  const permitir = crearLimitador(config.limitePorIp, config.ventanaLimiteMs);
  const moderacion = crearApiModeracion(config, db, firma);
  const estadoActual = (): Estado => calcularEstado(db.contar(), config);

  // La ventana de inscripción puede abrir/cerrar sin que nadie se inscriba: se revisa periódicamente.
  let ultimoEstado = estadoActual().estado;
  const vigilancia = setInterval(() => {
    const estado = estadoActual();
    if (estado.estado !== ultimoEstado) {
      ultimoEstado = estado.estado;
      canal.difundir(estado);
    }
  }, 15_000);
  vigilancia.unref();

  const ipDe = (req: IncomingMessage): string => ipDeSolicitud(req, config);

  async function inscribir(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!permitir(ipDe(req))) {
      throw new ErrorSolicitud(429, {
        error: 'limite',
        mensaje: 'Se recibieron demasiadas inscripciones desde esta conexión. Intenta nuevamente en unos minutos.',
      });
    }

    const entrada = sanearEntrada(await leerJson(req));
    const hoy = hoyISO();
    const errores = validarInscripcion(entrada, hoy);
    if (Object.keys(errores).length > 0) {
      throw new ErrorSolicitud(422, { error: 'validacion', mensaje: 'Revisa los campos marcados.', campos: errores });
    }

    const estado = estadoActual();
    if (estado.estado === 'proximamente' || estado.estado === 'cerradas') {
      throw new ErrorSolicitud(403, { error: estado.estado, mensaje: MENSAJES_ESTADO[estado.estado] });
    }

    const resultado = db.registrar(entrada, hoy, calcularEdad(entrada.fechaNacimiento, hoy)!, config.totalCupos);
    if (!resultado.ok) {
      if (resultado.motivo === 'duplicado') {
        throw new ErrorSolicitud(409, {
          error: 'duplicado',
          mensaje: 'Ya existe una inscripción con esta cédula o pasaporte.',
          campos: { documento: 'Este documento ya está inscrito.' },
        });
      }
      canal.difundir(estadoActual());
      throw new ErrorSolicitud(409, { error: 'agotadas', mensaje: MENSAJES_ESTADO.agotadas });
    }

    const nuevo = estadoActual();
    ultimoEstado = nuevo.estado;
    canal.difundir(nuevo);
    console.info(`[inscripción] ${resultado.inscripcion.codigo} · ${nuevo.inscritos}/${nuevo.total}`);
    const boleto = firma.firmar(resultado.id, 1);
    const url = config.urlPublica ? new URL(rutaVerificacion(boleto), config.urlPublica).href : null;
    enviarJson(res, 201, { inscripcion: resultado.inscripcion, boleto, url, estado: nuevo });
  }

  /** Atiende /api/*. Devuelve false si la ruta no es del API. */
  async function manejar(req: IncomingMessage, res: ServerResponse, ruta: string): Promise<boolean> {
    try {
      if (ruta === '/api/estado' && req.method === 'GET') {
        enviarJson(res, 200, estadoActual());
      } else if (ruta === '/api/estado/stream' && req.method === 'GET') {
        if (!canal.suscribir(req, res, estadoActual())) {
          enviarJson(res, 503, { error: 'limite', mensaje: 'Demasiadas conexiones en tiempo real.' });
        }
      } else if (ruta === '/api/inscripciones' && req.method === 'POST') {
        await inscribir(req, res);
      } else if (ruta === '/api/salud' && req.method === 'GET') {
        enviarJson(res, 200, { ok: true, conexiones: canal.conexiones });
      } else if (await moderacion.manejar(req, res, ruta)) {
        // boletos y moderación
      } else if (ruta.startsWith('/api/')) {
        enviarJson(res, 404, { error: 'solicitud', mensaje: 'Ruta no encontrada.' });
      } else {
        return false;
      }
    } catch (error) {
      if (error instanceof ErrorSolicitud) {
        enviarJson(res, error.status, error.cuerpo);
      } else {
        console.error('[api]', error);
        if (!res.headersSent) enviarJson(res, 500, { error: 'interno', mensaje: 'Ocurrió un error inesperado. Intenta nuevamente.' });
      }
    }
    return true;
  }

  return {
    manejar,
    cerrar: () => {
      clearInterval(vigilancia);
      moderacion.cerrar();
    },
  };
}
