import {
  CAMPOS_VALIDADOS,
  avisoEdad,
  calcularEdad,
  formatearFecha,
  hoyISO,
  validarCampo,
  validarInscripcion,
  type CampoValidado,
  type Errores,
  type Estado,
  type EstadoInscripciones,
  type Inscripcion,
  type InscripcionEntrada,
} from '../../shared/inscripcion.ts';
import { enviarInscripcion, suscribirEstado } from './lib/api.ts';
import { montarBoleto } from './lib/boleto.ts';
import { montarCupos } from './lib/cupos.ts';
import { porId, pulsar, todos } from './lib/dom.ts';
import { marcarJs } from './lib/movimiento.ts';
import { ahora } from './lib/reloj.ts';

marcarJs();

const form = porId<HTMLFormElement>('inscripcion-form');
const confirmacion = porId('confirmacion');
const resumen = porId('resumen');
const fechaInscripcion = porId<HTMLInputElement>('fechaInscripcion');
const fechaNacimiento = porId<HTMLInputElement>('fechaNacimiento');
const edad = porId<HTMLInputElement>('edad');
const botonEnviar = form.querySelector<HTMLButtonElement>('[data-submit]')!;
const alerta = form.querySelector<HTMLElement>('[data-form-alert]')!;
const progreso = form.querySelector<HTMLElement>('[data-form-progress]');
const cerrado = document.querySelector<HTMLElement>('[data-form-cerrado]')!;

const MENSAJES_CERRADO: Record<Exclude<EstadoInscripciones, 'abiertas'>, [string, string]> = {
  proximamente: [
    'Las inscripciones aún no están abiertas',
    'Se prevé realizarlas del 1 al 11 de noviembre de 2026. Las fechas definitivas se comunicarán por los canales oficiales.',
  ],
  cerradas: ['Inscripciones cerradas', 'El período de inscripción ha finalizado.'],
  agotadas: ['Cupos agotados', 'Se completaron todos los cupos disponibles para la carrera.'],
};

/** Fecha de referencia para la edad: la del servidor (zona horaria del evento). */
const referencia = (): string => hoyISO(new Date(ahora()));

let enviando = false;

// ── Lectura y errores ──────────────────────────────────────────────

const texto = (id: string): string => porId<HTMLInputElement>(id).value.trim();
const marcado = (id: string): boolean => porId<HTMLInputElement>(id).checked;

function leerValores(): InscripcionEntrada {
  return {
    nombres: texto('nombres'),
    apellidos: texto('apellidos'),
    documento: texto('documento'),
    fechaNacimiento: fechaNacimiento.value,
    genero: texto('genero'),
    telefono: texto('telefono'),
    correo: texto('correo'),
    emergNombre: texto('emergNombre'),
    emergParentesco: texto('emergParentesco'),
    emergTelefono: texto('emergTelefono'),
    aceptaDeclaracion: marcado('aceptaDeclaracion'),
    autorizaFotos: marcado('autorizaFotos'),
  };
}

function mostrarError(campo: CampoValidado, mensaje: string | undefined): void {
  const input = porId<HTMLInputElement>(campo);
  const error = porId(`${campo}-error`);
  const contenedor = input.closest('.field, .check');
  const yaTenia = input.classList.contains('invalid');

  error.textContent = mensaje ?? '';
  input.classList.toggle('invalid', Boolean(mensaje));
  input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  if (mensaje) input.setAttribute('aria-describedby', error.id);
  else input.removeAttribute('aria-describedby');

  contenedor?.classList.toggle('has-error', Boolean(mensaje));
  // La sacudida solo cuando el error aparece, no en cada tecla.
  if (mensaje && !yaTenia && contenedor) pulsar(contenedor, 'is-shaking', 500);
}

function mostrarErrores(errores: Errores): void {
  for (const campo of CAMPOS_VALIDADOS) mostrarError(campo, errores[campo]);
  const primero = CAMPOS_VALIDADOS.find((c) => errores[c]);
  if (primero) porId(primero).focus();
}

function mostrarAlerta(mensaje: string | null): void {
  alerta.textContent = mensaje ?? '';
  alerta.hidden = !mensaje;
}

// ── Progreso por pasos ─────────────────────────────────────────────

const pasos = todos<HTMLFieldSetElement>('fieldset[data-step]', form).map((fieldset) => ({
  fieldset,
  campos: CAMPOS_VALIDADOS.filter((c) => fieldset.contains(document.getElementById(c))),
  indicador: progreso?.querySelector<HTMLElement>(`[data-step="${fieldset.dataset.step}"]`) ?? null,
}));

function actualizarProgreso(): void {
  if (!progreso) return;
  const valores = leerValores();
  const ref = referencia();
  let completos = 0;
  let actualMarcado = false;
  for (const { campos, indicador } of pasos) {
    const completo = campos.every((c) => !validarCampo(c, valores, ref));
    if (completo) completos++;
    indicador?.classList.toggle('is-complete', completo);
    const esActual = !completo && !actualMarcado;
    if (esActual) actualMarcado = true;
    indicador?.classList.toggle('is-current', esActual);
  }
  progreso.style.setProperty('--form-progress', String(completos / pasos.length));
}

// ── Estado de las inscripciones ────────────────────────────────────

function aplicarEstado(estado: Estado): void {
  if (!confirmacion.hidden) return; // Tras inscribirse se conserva la confirmación.
  const abierto = estado.estado === 'abiertas';
  form.hidden = !abierto;
  cerrado.hidden = abierto;
  if (estado.estado !== 'abiertas') {
    const [titulo, detalle] = MENSAJES_CERRADO[estado.estado];
    cerrado.querySelector('[data-cerrado-titulo]')!.textContent = titulo;
    cerrado.querySelector('[data-cerrado-texto]')!.textContent = detalle;
  }
}

// ── Confirmación ───────────────────────────────────────────────────

function mostrarConfirmacion(d: Inscripcion, boleto: string, url: string | null): void {
  const filas: Array<[string, string]> = [
    ['Fecha de inscripción', formatearFecha(d.fechaInscripcion)],
    ['Nombres', d.nombres],
    ['Apellidos', d.apellidos],
    ['Cédula / pasaporte', d.documento],
    ['Fecha de nacimiento', formatearFecha(d.fechaNacimiento)],
    ['Edad', `${d.edad} años`],
    ['Género', d.genero || '—'],
    ['Teléfono', d.telefono],
    ['Correo', d.correo],
    ['Contacto de emergencia', `${d.emergNombre} (${d.emergParentesco}) · ${d.emergTelefono}`],
    ['Uso de fotografías o videos', d.autorizaFotos ? 'Autorizado' : 'No autorizado'],
  ];
  resumen.replaceChildren(
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
  confirmacion.querySelector('[data-codigo]')!.textContent = d.codigo;
  montarBoleto(confirmacion.querySelector<HTMLElement>('[data-boleto]')!, {
    codigo: d.codigo,
    nombres: d.nombres,
    apellidos: d.apellidos,
    boleto,
    url,
  });
  form.hidden = true;
  cerrado.hidden = true;
  confirmacion.hidden = false;
  confirmacion.focus();
  window.scrollTo({ top: confirmacion.offsetTop - 16 });
}

// ── Envío ──────────────────────────────────────────────────────────

function marcarEnviando(valor: boolean): void {
  enviando = valor;
  botonEnviar.disabled = valor;
  botonEnviar.classList.toggle('is-loading', valor);
  botonEnviar.setAttribute('aria-busy', String(valor));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enviando) return;
  mostrarAlerta(null);

  const datos = leerValores();
  const errores = validarInscripcion(datos, referencia());
  if (Object.keys(errores).length) {
    mostrarErrores(errores);
    return;
  }

  marcarEnviando(true);
  try {
    const resultado = await enviarInscripcion(datos);
    if (resultado.ok) {
      cupos.actualizar(resultado.estado);
      mostrarConfirmacion(resultado.inscripcion, resultado.boleto, resultado.url);
      return;
    }
    const { error } = resultado;
    if (error.campos) mostrarErrores(error.campos);
    const noDisponible = error.error === 'agotadas' || error.error === 'cerradas' || error.error === 'proximamente';
    if (noDisponible && ultimoEstado) {
      aplicarEstado({ ...ultimoEstado, estado: error.error as Exclude<EstadoInscripciones, 'abiertas'> });
      cerrado.focus();
    } else {
      mostrarAlerta(error.mensaje);
    }
  } catch {
    mostrarAlerta('No pudimos conectar con el servidor. Revisa tu conexión e intenta nuevamente; tus datos siguen en el formulario.');
  } finally {
    marcarEnviando(false);
  }
});

// ── Interacción de campos ──────────────────────────────────────────

for (const campo of CAMPOS_VALIDADOS) {
  const input = porId<HTMLInputElement>(campo);
  const validarAhora = (): void => mostrarError(campo, validarCampo(campo, leerValores(), referencia()));
  input.addEventListener(input.type === 'checkbox' ? 'change' : 'blur', validarAhora);
  input.addEventListener('input', () => {
    if (input.classList.contains('invalid')) validarAhora();
  });
}

const avisoEdadEl = document.querySelector<HTMLElement>('[data-edad-aviso]');

function actualizarEdad(): void {
  const ref = referencia();
  const valor = calcularEdad(fechaNacimiento.value, ref);
  edad.value = valor === null ? '' : `${valor} años`;
  // Fuera del rango sugerido: aviso informativo, NO bloquea la inscripción.
  if (avisoEdadEl) {
    const aviso = avisoEdad(fechaNacimiento.value, ref);
    avisoEdadEl.textContent = aviso ?? '';
    avisoEdadEl.hidden = !aviso;
  }
}

function iniciarFechas(): void {
  const hoy = referencia();
  fechaInscripcion.value = formatearFecha(hoy);
  fechaNacimiento.max = hoy;
  actualizarEdad();
}

fechaNacimiento.addEventListener('input', actualizarEdad);
form.addEventListener('input', actualizarProgreso);
form.addEventListener('change', actualizarProgreso);

form.addEventListener('reset', () => {
  for (const campo of CAMPOS_VALIDADOS) mostrarError(campo, undefined);
  mostrarAlerta(null);
  // Los valores se restauran después del evento reset.
  window.setTimeout(() => {
    iniciarFechas();
    actualizarProgreso();
  });
});

porId('nueva-inscripcion').addEventListener('click', () => {
  form.reset();
  confirmacion.hidden = true;
  if (ultimoEstado) aplicarEstado(ultimoEstado);
  if (!form.hidden) porId('nombres').focus();
});

confirmacion.querySelector('[data-imprimir]')?.addEventListener('click', () => window.print());

// ── Arranque ───────────────────────────────────────────────────────

const cupos = montarCupos();
let ultimoEstado: Estado | null = null;

suscribirEstado(
  (estado) => {
    const primeraVez = ultimoEstado === null;
    ultimoEstado = estado;
    cupos.actualizar(estado);
    aplicarEstado(estado);
    // La fecha de referencia se ajusta con la hora del servidor al recibir el primer estado.
    if (primeraVez) iniciarFechas();
  },
  () => cupos.desconectado(),
);

iniciarFechas();
actualizarProgreso();
