import {
  MINUTOS_PARA_DESHACER,
  extraerToken,
  type ConsultaModerador,
  type PuntoControl,
  type SesionModerador,
} from '../../shared/boleto.ts';
import {
  buscarInscripcion,
  cerrarSesion,
  consultarBoleto,
  iniciarSesion,
  deshacerIngreso,
  recuperarBoleto,
  registrarIngreso,
  resumenControl,
  sesionActual,
  verificarBoleto,
} from './lib/api-boletos.ts';
import { montarBoleto, type DatosBoleto } from './lib/boleto.ts';
import { formatearNumero, movimientoReducido, porId } from './lib/dom.ts';
import { MENSAJES_CAMARA, crearEscaner, type ErrorCamara } from './lib/escaner.ts';
import { marcarJs } from './lib/movimiento.ts';

marcarJs();

const $ = <T extends Element = HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`No se encontró ${selector}`);
  return el;
};

const panelModerador = $('[data-moderador]');
const nombreModerador = $('[data-moderador-nombre]');
const contenedorPuntos = $('[data-puntos]');
const textoResumen = $('[data-resumen]');
const botonCerrarSesion = $<HTMLButtonElement>('[data-cerrar-sesion]');

const lector = $('[data-lector]');
const visor = $('[data-visor]');
const avisoVisor = $('[data-visor-aviso]');
const botonCamara = $<HTMLButtonElement>('[data-camara]');
const errorCamara = $('[data-camara-error]');
const formBusqueda = $<HTMLFormElement>('[data-busqueda]');
const campoBusqueda = porId<HTMLInputElement>('busqueda');
const formPublico = $<HTMLFormElement>('[data-busqueda-publica]');
const errorPublico = $('[data-busqueda-publica-error]');
const botonPublico = $<HTMLButtonElement>('[data-busqueda-publica-enviar]');
const resultadoBoleto = $('[data-resultado-boleto]');

const resultado = $('[data-resultado]');
const resultadoTitulo = $('[data-resultado-titulo]');
const resultadoDetalle = $('[data-resultado-detalle]');
const resultadoDatos = $('[data-resultado-datos]');
const resultadoIngresos = $('[data-resultado-ingresos]');
const resultadoRegistro = $('[data-resultado-registro]');
const resultadoPunto = $('[data-resultado-punto]');
const resultadoPuntoNombre = $('[data-resultado-punto-nombre]');
const resultadoError = $('[data-resultado-error]');
const botonConfirmar = $<HTMLButtonElement>('[data-confirmar]');
const textoConfirmar = $('[data-confirmar-texto]');
const botonDeshacer = $<HTMLButtonElement>('[data-deshacer]');
const botonSiguiente = $<HTMLButtonElement>('[data-siguiente]');
const textoSiguiente = $('[data-siguiente-texto]');
const iconoSiguiente = $('.resultado__siguiente-icono');

const acceso = $<HTMLDetailsElement>('[data-acceso]');
const formLogin = $<HTMLFormElement>('[data-login]');
const errorLogin = $('[data-login-error]');
const botonLogin = $<HTMLButtonElement>('[data-login-enviar]');

const CLAVE_PUNTO = 'carrera7k.punto';
const RESUMEN_MS = 30_000;

let sesion: SesionModerador | null = null;
let punto: PuntoControl | null = null;
let consultaActual: ConsultaModerador | null = null;
let ocupado = false;
let temporizadorResumen: number | undefined;
/** La cámara estaba encendida al mostrar el resultado: se vuelve a encender con «Escanear otro boleto». */
let volverACamara = false;

const formatoFecha = new Intl.DateTimeFormat('es-EC', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Guayaquil',
});

const guardar = (clave: string, valor: string): void => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // almacenamiento no disponible: solo se pierde la preferencia
  }
};

const leer = (clave: string): string | null => {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
};

function vibrar(patron: number | number[]): void {
  try {
    navigator.vibrate?.(patron);
  } catch {
    // no disponible (iPhone)
  }
}

// ── Escáner ────────────────────────────────────────────────────────

const escaner = crearEscaner($<HTMLVideoElement>('[data-video]'), (texto) => void procesarLectura(texto));

function mostrarErrorCamara(mensaje: string | null): void {
  errorCamara.textContent = mensaje ?? '';
  errorCamara.hidden = !mensaje;
}

function actualizarBotonCamara(): void {
  botonCamara.querySelector('.btn__label')!.textContent = escaner.activo ? 'Apagar cámara' : 'Activar cámara';
  botonCamara.classList.toggle('btn--cta', !escaner.activo);
  botonCamara.classList.toggle('btn--ghost', escaner.activo);
  visor.classList.toggle('is-activo', escaner.activo);
  avisoVisor.hidden = escaner.activo;
}

async function encenderCamara(): Promise<void> {
  mostrarErrorCamara(null);
  botonCamara.disabled = true;
  avisoVisor.textContent = 'Iniciando la cámara…';
  try {
    await escaner.iniciar();
  } catch (error) {
    const tipo: ErrorCamara = typeof error === 'string' && error in MENSAJES_CAMARA ? (error as ErrorCamara) : 'desconocido';
    mostrarErrorCamara(MENSAJES_CAMARA[tipo]);
    avisoVisor.textContent = 'La cámara está apagada.';
  } finally {
    botonCamara.disabled = false;
    actualizarBotonCamara();
  }
}

function apagarCamara(): void {
  escaner.detener();
  actualizarBotonCamara();
}

botonCamara.addEventListener('click', () => {
  if (escaner.activo) {
    mostrarErrorCamara(null);
    apagarCamara();
  } else {
    void encenderCamara();
  }
});

// La cámara se apaga al salir de la pestaña (ahorra batería y libera el dispositivo).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && escaner.activo) {
    escaner.detener();
    actualizarBotonCamara();
  }
});

// ── Resultado ─────────────────────────────────────────────────────

type TipoResultado = 'valido' | 'invalido' | 'consulta' | 'usado' | 'registrado' | 'cargando';

interface Vista {
  tipo: TipoResultado;
  titulo: string;
  detalle?: string;
  consulta?: ConsultaModerador;
  /** Muestra «Confirmar <punto>» (inscripción válida y aún sin registrar en el punto actual). */
  confirmar?: boolean;
  /** Muestra «Deshacer este registro» (recién registrado por este moderador). */
  deshacer?: boolean;
  /** Boleto completo (búsqueda del propio participante con cédula + fecha de nacimiento). */
  boleto?: DatosBoleto;
}

/** «Entrega de kit» → «entrega de kit», para frases como «Confirmar entrega de kit». */
const enFrase = (nombre: string): string => nombre.charAt(0).toLocaleLowerCase('es') + nombre.slice(1);

const plural = (n: number, uno: string, varios: string): string => `${formatearNumero(n)} ${n === 1 ? uno : varios}`;

function mostrarErrorResultado(mensaje: string | null): void {
  resultadoError.textContent = mensaje ?? '';
  resultadoError.hidden = !mensaje;
}

function mostrarResultado(vista: Vista): void {
  // Mientras se lee el resultado, la cámara se apaga y el lector se oculta: el resultado ocupa su lugar.
  if (escaner.activo) {
    volverACamara = true;
    apagarCamara();
  }
  lector.hidden = true;
  mostrarErrorResultado(null);

  // Siempre a la vista en modo moderador: dónde se registra lo que se confirme.
  resultadoPunto.hidden = !sesion || !punto || vista.tipo === 'cargando';
  resultadoPuntoNombre.textContent = punto?.nombre ?? '';

  // Sin confirmar, el botón secundario deja claro que la persona NO queda registrada.
  const siguiente = volverACamara ? 'escanear otro boleto' : 'volver al lector';
  textoSiguiente.textContent = vista.confirmar ? `No registrar y ${siguiente}` : siguiente.charAt(0).toUpperCase() + siguiente.slice(1);
  iconoSiguiente.toggleAttribute('hidden', !volverACamara);
  if (vista.confirmar && punto) textoConfirmar.textContent = `Confirmar ${enFrase(punto.nombre)}`;
  resultado.dataset.tipo = vista.tipo;
  resultadoTitulo.textContent = vista.titulo;
  resultadoDetalle.textContent = vista.detalle ?? '';
  resultadoDetalle.hidden = !vista.detalle;

  const c = vista.consulta;
  resultadoDatos.hidden = !c;
  resultadoRegistro.hidden = !c || !sesion;
  if (c) {
    const filas: Array<[string, string]> = [
      ['Nombre', `${c.participante.nombres} ${c.participante.apellidos}`],
      ['Código', c.participante.codigo],
      ['Cédula / pasaporte', c.participante.documento],
      ['Edad', `${c.participante.edad} años`],
    ];
    if (c.participante.genero) filas.push(['Género', c.participante.genero]);
    resultadoDatos.replaceChildren(
      ...filas.map(([k, v]) => {
        const fila = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = k;
        dd.textContent = v;
        fila.append(dt, dd);
        return fila;
      }),
    );
    resultadoIngresos.replaceChildren(
      ...(sesion?.puntos ?? []).map((p) => {
        const ingreso = c.ingresos.find((i) => i.punto === p.id);
        const li = document.createElement('li');
        li.classList.toggle('is-hecho', Boolean(ingreso));
        const actual = p.id === punto?.id;
        li.classList.toggle('is-actual', actual);
        li.textContent =
          (ingreso
            ? `${p.nombre}: registrado el ${formatoFecha.format(new Date(ingreso.fecha))} por ${ingreso.moderador}`
            : `${p.nombre}: pendiente`) + (actual ? ' (punto actual)' : '');
        return li;
      }),
    );
  }

  consultaActual = c ?? null;
  botonConfirmar.hidden = !vista.confirmar;
  botonConfirmar.disabled = false;
  botonDeshacer.hidden = !vista.deshacer;
  botonDeshacer.disabled = false;
  resultadoBoleto.hidden = !vista.boleto;
  if (vista.boleto) montarBoleto(resultadoBoleto, vista.boleto);
  resultado.hidden = false;
  resultado.classList.remove('is-entrando');
  void resultado.offsetWidth;
  resultado.classList.add('is-entrando');
  resultado.scrollIntoView({ block: 'start', behavior: movimientoReducido() ? 'auto' : 'smooth' });
  if (vista.tipo === 'cargando') return;
  (vista.confirmar ? botonConfirmar : botonSiguiente).focus({ preventScroll: true });
}

/** Cierra el resultado y vuelve al lector (con la cámara encendida si lo estaba). */
function volverAlLector(): void {
  resultado.hidden = true;
  consultaActual = null;
  lector.hidden = false;
  visor.scrollIntoView({ block: 'center', behavior: movimientoReducido() ? 'auto' : 'smooth' });
  if (volverACamara) {
    volverACamara = false;
    void encenderCamara();
  } else {
    botonCamara.focus({ preventScroll: true });
  }
}

botonSiguiente.addEventListener('click', volverAlLector);

/** Muestra la consulta del moderador según el estado del boleto en el punto elegido. */
function mostrarConsulta(c: ConsultaModerador): void {
  const ingreso = punto ? c.ingresos.find((i) => i.punto === punto!.id) : undefined;
  if (ingreso) {
    vibrar([80, 60, 80, 60, 80]);
    mostrarResultado({
      tipo: 'usado',
      titulo: 'Boleto ya utilizado en este punto',
      detalle:
        `Ya se registró en «${punto!.nombre}» el ${formatoFecha.format(new Date(ingreso.fecha))} ` +
        `por ${ingreso.moderador}. No lo registres de nuevo.`,
      consulta: c,
    });
    return;
  }
  vibrar(60);
  mostrarResultado({
    tipo: 'consulta',
    titulo: 'Inscripción válida',
    detalle: punto
      ? `Coteja el nombre y los últimos 4 dígitos con la cédula de la persona. Si coinciden, pulsa «Confirmar ${enFrase(punto.nombre)}».`
      : 'Selecciona un punto de control para poder registrar.',
    consulta: c,
    confirmar: Boolean(punto),
  });
}

async function procesarLectura(texto: string): Promise<void> {
  if (ocupado || !resultado.hidden) return;
  const token = extraerToken(texto);
  if (!token) {
    vibrar([80, 60, 80]);
    mostrarResultado({
      tipo: 'invalido',
      titulo: 'Código no reconocido',
      detalle: 'Este código QR no es un boleto de la Carrera 7K.',
    });
    return;
  }
  ocupado = true;
  mostrarResultado({ tipo: 'cargando', titulo: 'Verificando…' });
  try {
    if (sesion) {
      const r = await consultarBoleto(token);
      if (r.ok) mostrarConsulta(r.datos);
      else if (r.status === 401) {
        cerrarSesionLocal();
        await procesarPublico(token);
      } else {
        vibrar([80, 60, 80]);
        mostrarResultado({ tipo: 'invalido', titulo: 'Boleto no válido', detalle: r.error.mensaje });
      }
    } else {
      await procesarPublico(token);
    }
  } finally {
    ocupado = false;
  }
}

async function procesarPublico(token: string): Promise<void> {
  const r = await verificarBoleto(token);
  if (!r.ok) {
    mostrarResultado({ tipo: 'invalido', titulo: 'No se pudo verificar', detalle: r.error.mensaje });
    return;
  }
  if (r.datos.valido) {
    vibrar(60);
    mostrarResultado({
      tipo: 'valido',
      titulo: 'Boleto válido',
      detalle: `Inscripción ${r.datos.codigo}. Esta consulta pública no muestra datos personales.`,
    });
  } else {
    vibrar([80, 60, 80]);
    mostrarResultado({
      tipo: 'invalido',
      titulo: 'Boleto no válido',
      detalle: 'El código QR no corresponde a una inscripción registrada en esta plataforma.',
    });
  }
}

/** Último registro hecho desde esta pantalla, para poder deshacerlo si fue un error. */
let ultimoRegistro: { codigo: string; punto: PuntoControl } | null = null;

botonConfirmar.addEventListener('click', async () => {
  // El punto se fija al pulsar: si se cambia mientras responde el servidor, no se mezcla.
  const p = punto;
  if (!consultaActual || !p || ocupado) return;
  ocupado = true;
  botonConfirmar.disabled = true;
  botonConfirmar.classList.add('is-loading');
  mostrarErrorResultado(null);
  try {
    const r = await registrarIngreso(consultaActual.participante.codigo, p.id);
    if (!r.ok) {
      if (r.status === 401) {
        cerrarSesionLocal();
        mostrarResultado({ tipo: 'invalido', titulo: 'Sesión cerrada', detalle: 'Inicia sesión de nuevo para registrar. No se registró nada.' });
        return;
      }
      // Se conserva la ficha para reintentar: el registro NO se hizo.
      vibrar([80, 60, 80]);
      mostrarErrorResultado(`No se registró. ${r.error.mensaje}`);
      botonConfirmar.disabled = false;
      return;
    }
    if (!r.datos.nuevo) {
      // Otro moderador lo registró un instante antes.
      mostrarConsulta(r.datos);
      return;
    }
    vibrar(150);
    ultimoRegistro = { codigo: r.datos.participante.codigo, punto: p };
    const hecho = r.datos.ingresos.find((i) => i.punto === p.id);
    mostrarResultado({
      tipo: 'registrado',
      titulo: `Registrado: ${p.nombre}`,
      detalle:
        `${r.datos.participante.nombres} ${r.datos.participante.apellidos}` +
        (hecho ? ` · ${formatoFecha.format(new Date(hecho.fecha))}` : '') +
        `. Si fue un error, puedes deshacerlo durante ${MINUTOS_PARA_DESHACER} minutos.`,
      consulta: r.datos,
      deshacer: true,
    });
    void actualizarResumen();
  } finally {
    botonConfirmar.classList.remove('is-loading');
    ocupado = false;
  }
});

botonDeshacer.addEventListener('click', async () => {
  const registro = ultimoRegistro;
  if (!registro || ocupado) return;
  if (!window.confirm(`¿Deshacer el registro de ${registro.codigo} en «${registro.punto.nombre}»?`)) return;
  ocupado = true;
  botonDeshacer.disabled = true;
  botonDeshacer.classList.add('is-loading');
  mostrarErrorResultado(null);
  try {
    const r = await deshacerIngreso(registro.codigo, registro.punto.id);
    if (!r.ok) {
      if (r.status === 401) cerrarSesionLocal();
      mostrarErrorResultado(r.error.mensaje);
      botonDeshacer.disabled = false;
      return;
    }
    ultimoRegistro = null;
    void actualizarResumen();
    // Vuelve a la ficha sin registrar, con el aviso de que se deshizo.
    mostrarConsulta(r.datos);
    resultadoDetalle.textContent = `Registro deshecho: ${registro.codigo} vuelve a quedar pendiente en «${registro.punto.nombre}».`;
  } finally {
    botonDeshacer.classList.remove('is-loading');
    ocupado = false;
  }
});

// Búsqueda manual (moderadores)
formBusqueda.addEventListener('submit', async (e) => {
  e.preventDefault();
  const busqueda = campoBusqueda.value.trim();
  if (!busqueda || ocupado) return;
  ocupado = true;
  mostrarResultado({ tipo: 'cargando', titulo: 'Buscando…' });
  try {
    const r = await buscarInscripcion(busqueda);
    if (r.ok) {
      campoBusqueda.value = '';
      mostrarConsulta(r.datos);
    } else {
      if (r.status === 401) cerrarSesionLocal();
      mostrarResultado({ tipo: 'invalido', titulo: 'Sin resultados', detalle: r.error.mensaje });
    }
  } finally {
    ocupado = false;
  }
});

// Búsqueda del participante (sin sesión): cédula + fecha de nacimiento
porId<HTMLInputElement>('pub-fecha').max = new Date().toISOString().slice(0, 10);

function mostrarErrorPublico(mensaje: string | null): void {
  errorPublico.textContent = mensaje ?? '';
  errorPublico.hidden = !mensaje;
}

formPublico.addEventListener('submit', async (e) => {
  e.preventDefault();
  const documento = porId<HTMLInputElement>('pub-documento').value.trim();
  const fechaNacimiento = porId<HTMLInputElement>('pub-fecha').value;
  if (!documento || !fechaNacimiento) {
    mostrarErrorPublico('Ingresa tu cédula o pasaporte y tu fecha de nacimiento.');
    return;
  }
  if (ocupado) return;
  ocupado = true;
  mostrarErrorPublico(null);
  botonPublico.disabled = true;
  botonPublico.classList.add('is-loading');
  try {
    const r = await recuperarBoleto(documento, fechaNacimiento);
    if (!r.ok) {
      mostrarErrorPublico(r.error.mensaje);
      return;
    }
    formPublico.reset();
    vibrar(60);
    mostrarResultado({
      tipo: 'valido',
      titulo: 'Inscripción válida',
      detalle: `${r.datos.nombres} ${r.datos.apellidos} · ${r.datos.codigo}. Este es tu boleto vigente.`,
      boleto: r.datos,
    });
  } finally {
    botonPublico.disabled = false;
    botonPublico.classList.remove('is-loading');
    ocupado = false;
  }
});

// ── Sesión de moderador ────────────────────────────────────────────

function pintarPuntos(puntos: PuntoControl[]): void {
  const guardado = leer(CLAVE_PUNTO);
  punto = puntos.find((p) => p.id === guardado) ?? puntos[0] ?? null;
  contenedorPuntos.replaceChildren(
    ...puntos.map((p) => {
      const etiqueta = document.createElement('label');
      etiqueta.className = 'punto';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'punto';
      radio.value = p.id;
      radio.checked = p.id === punto?.id;
      radio.addEventListener('change', () => {
        punto = p;
        guardar(CLAVE_PUNTO, p.id);
        void actualizarResumen();
        if (consultaActual) mostrarConsulta(consultaActual);
      });
      const texto = document.createElement('span');
      texto.textContent = p.nombre;
      etiqueta.append(radio, texto);
      return etiqueta;
    }),
  );
}

async function actualizarResumen(): Promise<void> {
  if (!sesion) return;
  const r = await resumenControl();
  if (!r.ok) {
    if (r.status === 401) cerrarSesionLocal();
    return;
  }
  const actual = r.datos.puntos.find((p) => p.id === punto?.id);
  const inscritos = r.datos.inscritos;
  // «Inscritos» = personas inscritas hasta ahora (no el total de cupos).
  textoResumen.textContent = actual
    ? `${actual.nombre}: ${plural(actual.ingresos, 'registrado', 'registrados')} de ${plural(inscritos, 'persona inscrita', 'personas inscritas')} · ` +
      `${plural(Math.max(inscritos - actual.ingresos, 0), 'pendiente', 'pendientes')}`
    : plural(inscritos, 'persona inscrita', 'personas inscritas');
}

function aplicarSesion(s: SesionModerador): void {
  sesion = s;
  nombreModerador.textContent = s.moderador.nombre;
  pintarPuntos(s.puntos);
  panelModerador.hidden = false;
  formBusqueda.hidden = false;
  formPublico.hidden = true;
  acceso.hidden = true;
  acceso.open = false;
  void actualizarResumen();
  window.clearInterval(temporizadorResumen);
  temporizadorResumen = window.setInterval(() => void actualizarResumen(), RESUMEN_MS);
}

function cerrarSesionLocal(): void {
  sesion = null;
  punto = null;
  window.clearInterval(temporizadorResumen);
  panelModerador.hidden = true;
  formBusqueda.hidden = true;
  formPublico.hidden = false;
  acceso.hidden = false;
}

function mostrarErrorLogin(mensaje: string | null): void {
  errorLogin.textContent = mensaje ?? '';
  errorLogin.hidden = !mensaje;
}

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = porId<HTMLInputElement>('usuario').value.trim();
  const clave = porId<HTMLInputElement>('clave').value;
  if (!usuario || !clave) {
    mostrarErrorLogin('Ingresa tu usuario y tu contraseña.');
    return;
  }
  mostrarErrorLogin(null);
  botonLogin.disabled = true;
  botonLogin.classList.add('is-loading');
  try {
    const r = await iniciarSesion(usuario, clave);
    if (r.ok) {
      formLogin.reset();
      aplicarSesion(r.datos);
      if (!resultado.hidden) volverAlLector();
      panelModerador.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else {
      mostrarErrorLogin(r.error.mensaje);
    }
  } finally {
    botonLogin.disabled = false;
    botonLogin.classList.remove('is-loading');
  }
});

botonCerrarSesion.addEventListener('click', async () => {
  await cerrarSesion();
  cerrarSesionLocal();
  if (!resultado.hidden) volverAlLector();
});

// ── Arranque ───────────────────────────────────────────────────────

async function arrancar(): Promise<void> {
  const r = await sesionActual();
  if (r.ok) aplicarSesion(r.datos);

  // Boleto abierto con la cámara del celular: …/verificar#t=<token>
  const token = extraerToken(location.hash);
  if (token) {
    history.replaceState(null, '', location.pathname + location.search);
    await procesarLectura(token);
  }
}

void arrancar();
