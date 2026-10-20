/**
 * Gestión de moderadores del día del evento (quienes validan los boletos).
 *   npm run moderadores -- listar
 *   npm run moderadores -- agregar <usuario> "<Nombre visible>"
 *   npm run moderadores -- clave <usuario>          cambia la contraseña y cierra sus sesiones
 *   npm run moderadores -- desactivar <usuario>     impide el acceso y cierra sus sesiones
 *   npm run moderadores -- activar <usuario>
 *   npm run moderadores -- eliminar <usuario>       solo si no registró ingresos (si no, desactivar)
 *   npm run moderadores -- demo                     cuenta de PRUEBA «admin» / «1234», solo entra desde
 *                                                   este equipo o la red local, nunca desde internet.
 *                                                   Eliminar antes de publicar.
 *
 * La contraseña se pide por teclado (no queda en el historial). Para automatizar,
 * se puede pasar en la variable de entorno MODERADOR_CLAVE.
 */
import { stdin, stdout } from 'node:process';
import { CLAVE_MIN, hashClave } from './claves.ts';
import { config } from './config.ts';
import { abrirBaseDeDatos } from './db.ts';

const [accion, usuario, nombre] = process.argv.slice(2);

function salir(mensaje: string, codigo = 1): never {
  (codigo ? console.error : console.info)(mensaje);
  db.cerrar();
  process.exit(codigo);
}

/** Lee una línea sin mostrar lo que se escribe. */
function preguntarOculto(pregunta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error('Sin terminal interactiva: define MODERADOR_CLAVE.'));
      return;
    }
    stdout.write(pregunta);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let valor = '';
    const alTeclear = (tecla: string): void => {
      for (const c of tecla) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', alTeclear);
          stdout.write('\n');
          resolve(valor);
          return;
        }
        if (c === '\u0003') {
          stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') valor = valor.slice(0, -1);
        else valor += c;
      }
    };
    stdin.on('data', alTeclear);
  });
}

async function pedirClave(): Promise<string> {
  const desdeEntorno = process.env.MODERADOR_CLAVE;
  const clave = desdeEntorno ?? (await preguntarOculto(`Contraseña (mínimo ${CLAVE_MIN} caracteres): `));
  if (clave.length < CLAVE_MIN) salir(`La contraseña debe tener al menos ${CLAVE_MIN} caracteres.`);
  if (desdeEntorno === undefined && (await preguntarOculto('Repite la contraseña: ')) !== clave) {
    salir('Las contraseñas no coinciden.');
  }
  return clave;
}

const db = abrirBaseDeDatos(config.dbPath);

const exigirUsuario = (): string => {
  if (!usuario) salir('Falta el usuario. Ejemplo: npm run moderadores -- agregar jperez "Juan Pérez"');
  if (!/^[a-z0-9._-]{3,32}$/i.test(usuario)) salir('Usuario inválido: 3 a 32 letras, números, punto, guion o guion bajo.');
  return usuario;
};

switch (accion) {
  case 'listar': {
    const filas = db.moderadores();
    if (filas.length === 0) salir('No hay moderadores. Crea uno con: npm run moderadores -- agregar <usuario> "<Nombre>"', 0);
    console.table(
      filas.map((m) => ({
        usuario: m.usuario,
        nombre: m.nombre,
        activo: m.activo === 1 ? 'sí' : 'no',
        demo: m.demo === 1 ? 'sí' : '',
        creado: m.creado_en,
      })),
    );
    break;
  }
  case 'agregar': {
    const u = exigirUsuario();
    const visible = (nombre ?? u).trim().slice(0, 80);
    if (db.moderador(u)) salir(`El usuario "${u}" ya existe.`);
    if (!db.crearModerador(u, visible, hashClave(await pedirClave()))) salir(`El usuario "${u}" ya existe.`);
    console.info(`Moderador "${u}" (${visible}) creado.`);
    break;
  }
  case 'clave': {
    const u = exigirUsuario();
    if (!db.moderador(u)) salir(`No existe el usuario "${u}".`);
    db.cambiarClave(u, hashClave(await pedirClave()));
    console.info(`Contraseña de "${u}" actualizada; sus sesiones abiertas se cerraron.`);
    break;
  }
  case 'demo': {
    // Contraseña corta a propósito, solo para probar en local: el servidor rechaza esta cuenta
    // si la conexión no viene del propio equipo y avisa al arrancar mientras exista.
    const existente = db.moderador('admin');
    if (existente && existente.demo !== 1) salir('Ya existe un moderador real llamado "admin": no se toca.');
    if (existente) db.cambiarClave('admin', hashClave('1234'));
    else db.crearModerador('admin', 'Administrador (demo)', hashClave('1234'), true);
    db.activarModerador('admin', true);
    console.info('Cuenta de demostración lista: usuario "admin", contraseña "1234" (solo desde este equipo o la red local).');
    console.info('Elimínala antes de publicar: npm run moderadores -- eliminar admin');
    break;
  }
  case 'eliminar': {
    const u = exigirUsuario();
    const r = db.eliminarModerador(u);
    if (r === 'no_existe') salir(`No existe el usuario "${u}".`);
    if (r === 'con_ingresos') salir(`"${u}" ya registró ingresos (quedan en el historial): usa «desactivar».`);
    console.info(`Moderador "${u}" eliminado.`);
    break;
  }
  case 'activar':
  case 'desactivar': {
    const u = exigirUsuario();
    if (!db.activarModerador(u, accion === 'activar')) salir(`No existe el usuario "${u}".`);
    console.info(`Moderador "${u}" ${accion === 'activar' ? 'activado' : 'desactivado (sesiones cerradas)'}.`);
    break;
  }
  default:
    salir(
      'Uso: npm run moderadores -- <listar | agregar <usuario> "<Nombre>" | clave <usuario> | activar <usuario> | desactivar <usuario> | eliminar <usuario> | demo>',
    );
}

db.cerrar();
