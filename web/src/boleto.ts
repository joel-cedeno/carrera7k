import { hoyISO } from '../../shared/inscripcion.ts';
import { recuperarBoleto } from './lib/api-boletos.ts';
import { montarBoleto } from './lib/boleto.ts';
import { porId } from './lib/dom.ts';
import { marcarJs } from './lib/movimiento.ts';

marcarJs();

const form = document.querySelector<HTMLFormElement>('[data-recuperar]')!;
const error = document.querySelector<HTMLElement>('[data-recuperar-error]')!;
const enviar = document.querySelector<HTMLButtonElement>('[data-recuperar-enviar]')!;
const tarjeta = document.querySelector<HTMLElement>('[data-boleto]')!;
const documento = porId<HTMLInputElement>('documento');
const fechaNacimiento = porId<HTMLInputElement>('fechaNacimiento');

fechaNacimiento.max = hoyISO();

function mostrarError(mensaje: string | null): void {
  error.textContent = mensaje ?? '';
  error.hidden = !mensaje;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!documento.value.trim() || !fechaNacimiento.value) {
    mostrarError('Ingresa tu cédula o pasaporte y tu fecha de nacimiento.');
    return;
  }
  mostrarError(null);
  enviar.disabled = true;
  enviar.classList.add('is-loading');
  try {
    const r = await recuperarBoleto(documento.value.trim(), fechaNacimiento.value);
    if (!r.ok) {
      mostrarError(r.error.mensaje);
      return;
    }
    montarBoleto(tarjeta, r.datos);
    form.hidden = true;
    tarjeta.hidden = false;
    tarjeta.focus();
  } finally {
    enviar.disabled = false;
    enviar.classList.remove('is-loading');
  }
});

tarjeta.querySelector('[data-imprimir]')?.addEventListener('click', () => window.print());
