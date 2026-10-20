import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  codigoDesdeId,
  enmascararDocumento,
  idDesdeCodigo,
  MINUTOS_PARA_DESHACER,
  rutaVerificacion,
  type BoletoRecuperado,
  type MotivoInvalido,
  type ConsultaModerador,
  type ResultadoIngreso,
  type ResumenControl,
  type SesionModerador,
  type VerificacionPublica,
} from '../shared/boleto.ts';
import type { FirmaBoletos } from './boletos.ts';
import { HASH_FICTICIO, sha256, tokenAleatorio, verificarClave } from './claves.ts';
import type { Config } from './config.ts';
import type { BaseDeDatos } from './db.ts';
import {
  ErrorSolicitud,
  crearContadorFallos,
  crearLimitador,
  enviarJson,
  esHttps,
  exigirMismoOrigen,
  ipDe,
  leerCookies,
  leerJson,
  textoDe,
  viaProxyNoConfiable,
} from './http.ts';

const COOKIE = 'mod_sesion';
const RUTA_COOKIE = '/api/moderacion';

const NO_AUTENTICADO = new ErrorSolicitud(401, { error: 'autenticacion', mensaje: 'Inicia sesión como moderador.' });
const DEMASIADOS = new ErrorSolicitud(429, {
  error: 'limite',
  mensaje: 'Demasiados intentos. Espera unos minutos e intenta nuevamente.',
});

/**
 * Boletos y validación del día del evento.
 *  Público:      POST /api/boletos/verificar   · POST /api/boletos/recuperar
 *  Moderadores:  /api/moderacion/*  (cookie de sesión HttpOnly, SameSite=Strict)
 */
export function crearApiModeracion(config: Config, db: BaseDeDatos, firma: FirmaBoletos) {
  const limiteVerificar = crearLimitador(120, 60_000);
  const limiteRecuperar = crearLimitador(10, 10 * 60_000);
  // Solo cuentan los intentos fallidos: varios moderadores pueden compartir IP (wifi del evento, operador móvil).
  const fallosIp = crearContadorFallos(20, 10 * 60_000);
  const fallosUsuario = crearContadorFallos(8, 15 * 60_000);
  const puntos = new Map(config.puntosControl.map((p) => [p.id, p]));

  const limpieza = setInterval(() => db.limpiarSesiones(), 3_600_000);
  limpieza.unref();

  const nombrePunto = (id: string): string => puntos.get(id)?.nombre ?? id;

  const urlDe = (token: string): string | null =>
    config.urlPublica ? new URL(rutaVerificacion(token), config.urlPublica).href : null;

  /**
   * Un boleto es válido solo si: la firma es auténtica, la inscripción existe y es la versión
   * vigente (un boleto reemitido anula los anteriores).
   */
  function validarBoleto(token: string): { ok: true; id: number } | { ok: false; motivo: MotivoInvalido } {
    const v = firma.verificar(token);
    if (!v.ok) return { ok: false, motivo: 'firma' };
    const p = db.participante(v.id);
    if (!p) return { ok: false, motivo: 'inexistente' };
    if (p.boletoVersion !== v.version) return { ok: false, motivo: 'reemplazado' };
    return { ok: true, id: v.id };
  }

  const MENSAJES_INVALIDO: Record<MotivoInvalido, string> = {
    firma: 'Boleto no válido: el código QR no fue emitido por esta plataforma o está alterado.',
    inexistente: 'Boleto no válido: la inscripción ya no existe.',
    reemplazado:
      'Boleto anulado: se emitió uno nuevo para esta inscripción. La persona debe presentar su boleto vigente (lo recupera en «Mi boleto»).',
  };

  /**
   * Las cuentas de demostración solo entran desde el propio equipo o la red local (wifi de la oficina,
   * 10.x, 172.16–31.x, 192.168.x, IPv6 local). Nunca desde internet. Si la petición llega a través de
   * un proxy (hosting en la nube, nginx…) sin TRUST_PROXY=1, se rechaza: ahí la IP «local» sería la del
   * proxy y cualquiera de internet pasaría por local.
   */
  const esRedLocal = (ip: string): boolean => {
    const v4 = ip.replace(/^::ffff:/i, '');
    if (/^(127|10)\./.test(v4) || /^192\.168\./.test(v4) || /^172\.(1[6-9]|2\d|3[01])\./.test(v4)) return true;
    return ip === '::1' || /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip);
  };

  function cookie(req: IncomingMessage, valor: string, maxAgeS: number): string {
    const partes = [`${COOKIE}=${valor}`, `Path=${RUTA_COOKIE}`, `Max-Age=${maxAgeS}`, 'HttpOnly', 'SameSite=Strict'];
    if (esHttps(req, config)) partes.push('Secure');
    return partes.join('; ');
  }

  function moderadorDe(req: IncomingMessage) {
    const token = leerCookies(req).get(COOKIE);
    return token ? db.sesion(sha256(token)) : null;
  }

  function exigirModerador(req: IncomingMessage) {
    const moderador = moderadorDe(req);
    if (!moderador) throw NO_AUTENTICADO;
    return moderador;
  }

  const sesionDe = (m: { usuario: string; nombre: string }): SesionModerador => ({
    moderador: { usuario: m.usuario, nombre: m.nombre },
    puntos: config.puntosControl,
  });

  function consulta(id: number): ConsultaModerador {
    const p = db.participante(id);
    if (!p) throw new ErrorSolicitud(404, { error: 'no_encontrado', mensaje: 'No existe una inscripción con ese código.' });
    return {
      participante: {
        codigo: codigoDesdeId(p.id),
        nombres: p.nombres,
        apellidos: p.apellidos,
        documento: enmascararDocumento(p.documento),
        edad: p.edad,
        genero: p.genero,
      },
      ingresos: db.ingresosDe(id).map((i) => ({ punto: i.punto, fecha: i.registrado_en, moderador: i.moderador })),
    };
  }

  // ── Público ──────────────────────────────────────────────────────

  async function verificarPublico(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!limiteVerificar(ipDe(req, config))) throw DEMASIADOS;
    const v = validarBoleto(textoDe(await leerJson(req), 'token'));
    const cuerpo: VerificacionPublica = v.ok ? { valido: true, codigo: codigoDesdeId(v.id) } : { valido: false };
    enviarJson(res, 200, cuerpo);
  }

  async function recuperar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!limiteRecuperar(ipDe(req, config))) throw DEMASIADOS;
    const cuerpo = await leerJson(req);
    const documento = textoDe(cuerpo, 'documento', 40);
    const fechaNacimiento = textoDe(cuerpo, 'fechaNacimiento', 10);
    if (!documento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) {
      throw new ErrorSolicitud(422, { error: 'validacion', mensaje: 'Ingresa tu cédula o pasaporte y tu fecha de nacimiento.' });
    }
    const r = db.recuperar(documento, fechaNacimiento);
    if (!r) {
      throw new ErrorSolicitud(404, {
        error: 'no_encontrado',
        mensaje: 'No encontramos una inscripción con esos datos. Revisa el documento y la fecha de nacimiento.',
      });
    }
    const token = firma.firmar(r.id, r.boletoVersion);
    const boleto: BoletoRecuperado = {
      codigo: codigoDesdeId(r.id),
      nombres: r.nombres,
      apellidos: r.apellidos,
      boleto: token,
      url: urlDe(token),
    };
    enviarJson(res, 200, boleto);
  }

  // ── Moderadores ──────────────────────────────────────────────────

  async function iniciarSesion(req: IncomingMessage, res: ServerResponse): Promise<void> {
    exigirMismoOrigen(req, config);
    const ip = ipDe(req, config);
    if (fallosIp.bloqueado(ip)) throw DEMASIADOS;
    const cuerpo = await leerJson(req);
    const usuario = textoDe(cuerpo, 'usuario', 64);
    const clave = typeof (cuerpo as { clave?: unknown })?.clave === 'string' ? (cuerpo as { clave: string }).clave.slice(0, 256) : '';
    const claveUsuario = usuario.toLowerCase();
    if (fallosUsuario.bloqueado(claveUsuario)) throw DEMASIADOS;

    const m = usuario ? db.moderador(usuario) : null;
    // Siempre se calcula un hash, exista o no el usuario: no se revela cuáles existen.
    const correcta = verificarClave(clave, m?.clave_hash ?? HASH_FICTICIO);
    if (!m || !correcta || m.activo !== 1 || (m.demo === 1 && (!esRedLocal(ip) || viaProxyNoConfiable(req, config)))) {
      fallosIp.fallo(ip);
      fallosUsuario.fallo(claveUsuario);
      throw new ErrorSolicitud(401, { error: 'autenticacion', mensaje: 'Usuario o contraseña incorrectos.' });
    }

    const token = tokenAleatorio();
    db.crearSesion(sha256(token), m.id, Date.now() + config.sesionMs);
    console.info(`[moderación] inicio de sesión: ${m.usuario}`);
    enviarJson(res, 200, sesionDe(m), { 'Set-Cookie': cookie(req, token, Math.floor(config.sesionMs / 1000)) });
  }

  function cerrarSesion(req: IncomingMessage, res: ServerResponse): void {
    exigirMismoOrigen(req, config);
    const token = leerCookies(req).get(COOKIE);
    if (token) db.borrarSesion(sha256(token));
    res.writeHead(204, { 'Set-Cookie': cookie(req, '', 0), 'Cache-Control': 'no-store' });
    res.end();
  }

  async function consultar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    exigirMismoOrigen(req, config);
    exigirModerador(req);
    const cuerpo = await leerJson(req);
    const token = textoDe(cuerpo, 'token');
    const busqueda = textoDe(cuerpo, 'busqueda', 40);

    let id: number | null;
    if (token) {
      const v = validarBoleto(token);
      if (!v.ok) throw new ErrorSolicitud(404, { error: 'no_encontrado', mensaje: MENSAJES_INVALIDO[v.motivo] });
      id = v.id;
    } else {
      // Búsqueda manual (QR ilegible): por cédula/pasaporte o por código de inscripción.
      // Primero el documento: una cédula solo con números también parecería un código.
      id = busqueda ? (db.idPorDocumento(busqueda) ?? idDesdeCodigo(busqueda)) : null;
      if (id === null) {
        throw new ErrorSolicitud(404, { error: 'no_encontrado', mensaje: 'No hay inscripciones con ese código o documento.' });
      }
    }
    enviarJson(res, 200, consulta(id));
  }

  async function registrarIngreso(req: IncomingMessage, res: ServerResponse): Promise<void> {
    exigirMismoOrigen(req, config);
    const moderador = exigirModerador(req);
    const cuerpo = await leerJson(req);
    const id = idDesdeCodigo(textoDe(cuerpo, 'codigo', 20));
    const punto = textoDe(cuerpo, 'punto', 32);
    if (!puntos.has(punto)) {
      throw new ErrorSolicitud(422, { error: 'validacion', mensaje: 'Selecciona un punto de control válido.' });
    }
    if (id === null || !db.participante(id)) {
      throw new ErrorSolicitud(404, { error: 'no_encontrado', mensaje: 'No existe una inscripción con ese código.' });
    }
    const nuevo = db.registrarIngreso(id, punto, moderador.id);
    if (nuevo) console.info(`[ingreso] ${codigoDesdeId(id)} · ${nombrePunto(punto)} · ${moderador.usuario}`);
    const resultado: ResultadoIngreso = { nuevo, ...consulta(id) };
    enviarJson(res, 200, resultado);
  }

  /** Deshace un registro hecho por error: solo el mismo moderador y dentro del plazo. */
  async function deshacerIngreso(req: IncomingMessage, res: ServerResponse): Promise<void> {
    exigirMismoOrigen(req, config);
    const moderador = exigirModerador(req);
    const cuerpo = await leerJson(req);
    const id = idDesdeCodigo(textoDe(cuerpo, 'codigo', 20));
    const punto = textoDe(cuerpo, 'punto', 32);
    if (id === null || !puntos.has(punto)) {
      throw new ErrorSolicitud(422, { error: 'validacion', mensaje: 'Datos incompletos para deshacer el registro.' });
    }
    const desde = new Date(Date.now() - MINUTOS_PARA_DESHACER * 60_000).toISOString();
    if (!db.deshacerIngreso(id, punto, moderador.id, desde)) {
      throw new ErrorSolicitud(409, {
        error: 'solicitud',
        mensaje: `No se puede deshacer: solo quien lo registró puede hacerlo, durante ${MINUTOS_PARA_DESHACER} minutos.`,
      });
    }
    console.info(`[ingreso deshecho] ${codigoDesdeId(id)} · ${nombrePunto(punto)} · ${moderador.usuario}`);
    enviarJson(res, 200, consulta(id));
  }

  function resumen(req: IncomingMessage, res: ServerResponse): void {
    exigirModerador(req);
    const conteo = db.contarIngresos();
    const cuerpo: ResumenControl = {
      inscritos: db.contar(),
      puntos: config.puntosControl.map((p) => ({ ...p, ingresos: conteo.get(p.id) ?? 0 })),
    };
    enviarJson(res, 200, cuerpo);
  }

  /** Atiende las rutas de boletos y moderación. Devuelve false si no son suyas. */
  async function manejar(req: IncomingMessage, res: ServerResponse, ruta: string): Promise<boolean> {
    const metodo = req.method;
    if (ruta === '/api/boletos/verificar' && metodo === 'POST') await verificarPublico(req, res);
    else if (ruta === '/api/boletos/recuperar' && metodo === 'POST') await recuperar(req, res);
    else if (ruta === '/api/boletos/clave-publica' && metodo === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/x-pem-file', 'Cache-Control': 'no-cache' });
      res.end(firma.clavePublicaPem);
    } else if (ruta === '/api/moderacion/sesion' && metodo === 'GET') {
      const m = moderadorDe(req);
      if (!m) throw NO_AUTENTICADO;
      enviarJson(res, 200, sesionDe(m));
    } else if (ruta === '/api/moderacion/sesion' && metodo === 'POST') await iniciarSesion(req, res);
    else if (ruta === '/api/moderacion/sesion' && metodo === 'DELETE') cerrarSesion(req, res);
    else if (ruta === '/api/moderacion/consultar' && metodo === 'POST') await consultar(req, res);
    else if (ruta === '/api/moderacion/ingresos' && metodo === 'POST') await registrarIngreso(req, res);
    else if (ruta === '/api/moderacion/ingresos/deshacer' && metodo === 'POST') await deshacerIngreso(req, res);
    else if (ruta === '/api/moderacion/resumen' && metodo === 'GET') resumen(req, res);
    else return false;
    return true;
  }

  return {
    manejar,
    cerrar: () => clearInterval(limpieza),
  };
}
