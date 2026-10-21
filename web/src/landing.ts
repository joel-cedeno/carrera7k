import { suscribirEstado } from './lib/api.ts';
import { montarBotonesInscripcion } from './lib/cta.ts';
import { montarCuentasRegresivas } from './lib/cuenta-regresiva.ts';
import { montarCupos } from './lib/cupos.ts';
import { aplicarModoDemo } from './lib/demo.ts';
import { montarMapa } from './lib/mapa.ts';
import {
  marcarJs,
  montarApariciones,
  montarBarraSuperior,
  montarMenuMovil,
  montarRotadores,
  montarSeccionActiva,
} from './lib/movimiento.ts';

marcarJs();

const cupos = montarCupos();
const botones = montarBotonesInscripcion();

suscribirEstado(
  (estado) => {
    cupos.actualizar(estado);
    botones.actualizar(estado.estado);
    aplicarModoDemo(estado);
  },
  () => cupos.desconectado(),
);

montarCuentasRegresivas();
montarApariciones();
montarBarraSuperior();
montarMenuMovil();
montarSeccionActiva();
montarRotadores();
montarMapa();
