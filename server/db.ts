import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { codigoDesdeId } from '../shared/boleto.ts';
import { normalizarDocumento, type Inscripcion, type InscripcionEntrada } from '../shared/inscripcion.ts';

export { codigoDesdeId };

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS inscripciones (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  creado_en           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fecha_inscripcion   TEXT    NOT NULL,
  nombres             TEXT    NOT NULL,
  apellidos           TEXT    NOT NULL,
  documento           TEXT    NOT NULL,
  documento_norm      TEXT    NOT NULL UNIQUE,
  fecha_nacimiento    TEXT    NOT NULL,
  edad                INTEGER NOT NULL,
  genero              TEXT    NOT NULL DEFAULT '',
  telefono            TEXT    NOT NULL,
  correo              TEXT    NOT NULL,
  emerg_nombre        TEXT    NOT NULL,
  emerg_parentesco    TEXT    NOT NULL,
  emerg_telefono      TEXT    NOT NULL,
  acepta_declaracion  INTEGER NOT NULL CHECK (acepta_declaracion = 1),
  autoriza_fotos      INTEGER NOT NULL CHECK (autoriza_fotos IN (0, 1))
);

-- Moderadores del día del evento (se gestionan con: npm run moderadores).
CREATE TABLE IF NOT EXISTS moderadores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  nombre      TEXT    NOT NULL,
  clave_hash  TEXT    NOT NULL,
  activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sesiones de moderadores. Solo se guarda el hash del token de la cookie.
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash    TEXT    PRIMARY KEY,
  moderador_id  INTEGER NOT NULL REFERENCES moderadores (id) ON DELETE CASCADE,
  creada_en     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expira_en     INTEGER NOT NULL
);

-- Ajustes internos. Aquí vive la clave privada que firma los boletos: así, respaldar la base de datos
-- respalda también la clave y nunca quedan separadas.
CREATE TABLE IF NOT EXISTS ajustes (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

-- Boletos validados: un ingreso por inscripción y punto de control (el segundo intento es «ya usado»).
CREATE TABLE IF NOT EXISTS ingresos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  inscripcion_id  INTEGER NOT NULL REFERENCES inscripciones (id),
  punto           TEXT    NOT NULL,
  moderador_id    INTEGER NOT NULL REFERENCES moderadores (id),
  registrado_en   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (inscripcion_id, punto)
);
`;

/** Columnas añadidas después de la primera versión: se agregan solas a bases de datos existentes. */
const MIGRACIONES: Array<{ tabla: string; columna: string; sql: string }> = [
  {
    tabla: 'inscripciones',
    columna: 'boleto_version',
    sql: 'ALTER TABLE inscripciones ADD COLUMN boleto_version INTEGER NOT NULL DEFAULT 1',
  },
  {
    tabla: 'moderadores',
    columna: 'demo',
    sql: 'ALTER TABLE moderadores ADD COLUMN demo INTEGER NOT NULL DEFAULT 0',
  },
];

export interface FilaParticipante {
  id: number;
  boletoVersion: number;
  nombres: string;
  apellidos: string;
  documento: string;
  edad: number;
  genero: string;
}

export interface FilaModerador {
  id: number;
  usuario: string;
  nombre: string;
  clave_hash: string;
  activo: number;
  demo: number;
  creado_en: string;
}

export interface FilaIngreso {
  inscripcion_id: number;
  punto: string;
  registrado_en: string;
  moderador: string;
}

export type ResultadoRegistro =
  | { ok: true; id: number; inscripcion: Inscripcion }
  | { ok: false; motivo: 'agotadas' | 'duplicado' };

export interface FilaExportacion {
  codigo: string;
  creado_en: string;
  fecha_inscripcion: string;
  nombres: string;
  apellidos: string;
  documento: string;
  fecha_nacimiento: string;
  edad: number;
  genero: string;
  telefono: string;
  correo: string;
  emerg_nombre: string;
  emerg_parentesco: string;
  emerg_telefono: string;
  autoriza_fotos: string;
}

function esViolacionUnica(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export function abrirBaseDeDatos(archivo: string) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
  `);
  db.exec(ESQUEMA);
  for (const m of MIGRACIONES) {
    const columnas = db.prepare(`PRAGMA table_info(${m.tabla})`).all() as Array<{ name: string }>;
    if (!columnas.some((c) => c.name === m.columna)) db.exec(m.sql);
  }
  // Datos personales y clave de firma: solo el usuario del servidor puede leer el archivo.
  for (const sufijo of ['', '-wal', '-shm']) {
    try {
      fs.chmodSync(archivo + sufijo, 0o600);
    } catch {
      // el archivo -wal/-shm puede no existir aún
    }
  }

  const sqlContar = db.prepare('SELECT COUNT(*) AS n FROM inscripciones');
  const sqlInsertar = db.prepare(`
    INSERT INTO inscripciones (
      fecha_inscripcion, nombres, apellidos, documento, documento_norm, fecha_nacimiento, edad, genero,
      telefono, correo, emerg_nombre, emerg_parentesco, emerg_telefono, acepta_declaracion, autoriza_fotos
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const sqlListar = db.prepare(`
    SELECT id, creado_en, fecha_inscripcion, nombres, apellidos, documento, fecha_nacimiento, edad, genero,
           telefono, correo, emerg_nombre, emerg_parentesco, emerg_telefono, autoriza_fotos
    FROM inscripciones ORDER BY id
  `);

  const sqlParticipante = db.prepare(
    'SELECT id, boleto_version, nombres, apellidos, documento, edad, genero FROM inscripciones WHERE id = ?',
  );
  const sqlPorDocumento = db.prepare('SELECT id FROM inscripciones WHERE documento_norm = ?');
  const sqlRecuperar = db.prepare(
    'SELECT id, boleto_version, nombres, apellidos FROM inscripciones WHERE documento_norm = ? AND fecha_nacimiento = ?',
  );

  const sqlModerador = db.prepare('SELECT * FROM moderadores WHERE usuario = ?');
  const sqlModeradores = db.prepare('SELECT * FROM moderadores ORDER BY usuario');
  const sqlCrearModerador = db.prepare('INSERT INTO moderadores (usuario, nombre, clave_hash, demo) VALUES (?, ?, ?, ?)');
  const sqlEliminarModerador = db.prepare('DELETE FROM moderadores WHERE usuario = ?');
  const sqlTieneIngresos = db.prepare(
    'SELECT COUNT(*) AS n FROM ingresos WHERE moderador_id = (SELECT id FROM moderadores WHERE usuario = ?)',
  );
  const sqlAjuste = db.prepare('SELECT valor FROM ajustes WHERE clave = ?');
  const sqlGuardarAjuste = db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?)');
  const sqlReemitir = db.prepare(
    'UPDATE inscripciones SET boleto_version = boleto_version + 1 WHERE id = ? RETURNING boleto_version',
  );
  const sqlClaveModerador = db.prepare('UPDATE moderadores SET clave_hash = ? WHERE usuario = ?');
  const sqlActivarModerador = db.prepare('UPDATE moderadores SET activo = ? WHERE usuario = ?');

  const sqlCrearSesion = db.prepare('INSERT INTO sesiones (token_hash, moderador_id, expira_en) VALUES (?, ?, ?)');
  const sqlSesion = db.prepare(`
    SELECT m.id, m.usuario, m.nombre, m.demo FROM sesiones s JOIN moderadores m ON m.id = s.moderador_id
    WHERE s.token_hash = ? AND s.expira_en > ? AND m.activo = 1
  `);
  const sqlBorrarSesion = db.prepare('DELETE FROM sesiones WHERE token_hash = ?');
  const sqlBorrarSesionesDe = db.prepare(
    'DELETE FROM sesiones WHERE moderador_id = (SELECT id FROM moderadores WHERE usuario = ?)',
  );
  const sqlLimpiarSesiones = db.prepare('DELETE FROM sesiones WHERE expira_en <= ?');

  const sqlIngresosDe = db.prepare(`
    SELECT i.inscripcion_id, i.punto, i.registrado_en, m.nombre AS moderador
    FROM ingresos i JOIN moderadores m ON m.id = i.moderador_id
    WHERE i.inscripcion_id = ? ORDER BY i.registrado_en
  `);
  const sqlRegistrarIngreso = db.prepare(
    'INSERT OR IGNORE INTO ingresos (inscripcion_id, punto, moderador_id) VALUES (?, ?, ?)',
  );
  const sqlDeshacerIngreso = db.prepare(
    'DELETE FROM ingresos WHERE inscripcion_id = ? AND punto = ? AND moderador_id = ? AND registrado_en >= ?',
  );
  const sqlContarIngresos = db.prepare('SELECT punto, COUNT(*) AS n FROM ingresos GROUP BY punto');
  const sqlListarIngresos = db.prepare(`
    SELECT i.inscripcion_id, i.punto, i.registrado_en, m.nombre AS moderador
    FROM ingresos i JOIN moderadores m ON m.id = i.moderador_id ORDER BY i.id
  `);

  const contar = (): number => Number((sqlContar.get() as { n: number }).n);

  const aParticipante = (f: Record<string, unknown> | undefined): FilaParticipante | null =>
    f
      ? {
          id: Number(f.id),
          boletoVersion: Number(f.boleto_version),
          nombres: String(f.nombres),
          apellidos: String(f.apellidos),
          documento: String(f.documento),
          edad: Number(f.edad),
          genero: String(f.genero),
        }
      : null;

  const aIngreso = (f: Record<string, unknown>): FilaIngreso => ({
    inscripcion_id: Number(f.inscripcion_id),
    punto: String(f.punto),
    registrado_en: String(f.registrado_en),
    moderador: String(f.moderador),
  });

  return {
    contar,

    /**
     * Registra una inscripción de forma atómica: comprueba cupos e inserta en una sola transacción,
     * así nunca se supera el total aunque lleguen solicitudes simultáneas.
     */
    registrar(entrada: InscripcionEntrada, fechaInscripcion: string, edad: number, totalCupos: number): ResultadoRegistro {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (contar() >= totalCupos) {
          db.exec('ROLLBACK');
          return { ok: false, motivo: 'agotadas' };
        }
        const { lastInsertRowid } = sqlInsertar.run(
          fechaInscripcion,
          entrada.nombres,
          entrada.apellidos,
          entrada.documento,
          normalizarDocumento(entrada.documento),
          entrada.fechaNacimiento,
          edad,
          entrada.genero,
          entrada.telefono,
          entrada.correo,
          entrada.emergNombre,
          entrada.emergParentesco,
          entrada.emergTelefono,
          entrada.aceptaDeclaracion ? 1 : 0,
          entrada.autorizaFotos ? 1 : 0,
        );
        db.exec('COMMIT');
        return {
          ok: true,
          id: Number(lastInsertRowid),
          inscripcion: { ...entrada, codigo: codigoDesdeId(lastInsertRowid), fechaInscripcion, edad },
        };
      } catch (error) {
        db.exec('ROLLBACK');
        if (esViolacionUnica(error)) return { ok: false, motivo: 'duplicado' };
        throw error;
      }
    },

    listar(): FilaExportacion[] {
      return (sqlListar.all() as Array<Record<string, string | number>>).map((f) => ({
        codigo: codigoDesdeId(Number(f.id)),
        creado_en: String(f.creado_en),
        fecha_inscripcion: String(f.fecha_inscripcion),
        nombres: String(f.nombres),
        apellidos: String(f.apellidos),
        documento: String(f.documento),
        fecha_nacimiento: String(f.fecha_nacimiento),
        edad: Number(f.edad),
        genero: String(f.genero),
        telefono: String(f.telefono),
        correo: String(f.correo),
        emerg_nombre: String(f.emerg_nombre),
        emerg_parentesco: String(f.emerg_parentesco),
        emerg_telefono: String(f.emerg_telefono),
        autoriza_fotos: Number(f.autoriza_fotos) === 1 ? 'Sí' : 'No',
      }));
    },

    participante(id: number): FilaParticipante | null {
      return aParticipante(sqlParticipante.get(id) as Record<string, unknown> | undefined);
    },

    idPorDocumento(documento: string): number | null {
      const f = sqlPorDocumento.get(normalizarDocumento(documento)) as { id: number } | undefined;
      return f ? Number(f.id) : null;
    },

    /** Para que la persona recupere su boleto con su documento y su fecha de nacimiento. */
    recuperar(
      documento: string,
      fechaNacimiento: string,
    ): { id: number; boletoVersion: number; nombres: string; apellidos: string } | null {
      const f = sqlRecuperar.get(normalizarDocumento(documento), fechaNacimiento) as Record<string, unknown> | undefined;
      return f
        ? { id: Number(f.id), boletoVersion: Number(f.boleto_version), nombres: String(f.nombres), apellidos: String(f.apellidos) }
        : null;
    },

    /** Anula el boleto vigente: sube su versión y devuelve la nueva (null si no existe la inscripción). */
    reemitirBoleto(id: number): number | null {
      const f = sqlReemitir.get(id) as { boleto_version: number } | undefined;
      return f ? Number(f.boleto_version) : null;
    },

    // ── Ajustes ──────────────────────────────────────────────────────

    ajuste(clave: string): string | null {
      const f = sqlAjuste.get(clave) as { valor: string } | undefined;
      return f ? String(f.valor) : null;
    },

    /** Guarda un ajuste solo si no existía (nunca sobrescribe). false si ya había uno. */
    guardarAjusteNuevo(clave: string, valor: string): boolean {
      try {
        sqlGuardarAjuste.run(clave, valor);
        return true;
      } catch (error) {
        if (esViolacionUnica(error)) return false;
        throw error;
      }
    },

    // ── Moderadores ──────────────────────────────────────────────────

    moderador(usuario: string): FilaModerador | null {
      return (sqlModerador.get(usuario) as FilaModerador | undefined) ?? null;
    },

    moderadores(): FilaModerador[] {
      return sqlModeradores.all() as unknown as FilaModerador[];
    },

    /** false si el usuario ya existe. */
    crearModerador(usuario: string, nombre: string, claveHash: string, demo = false): boolean {
      try {
        sqlCrearModerador.run(usuario, nombre, claveHash, demo ? 1 : 0);
        return true;
      } catch (error) {
        if (esViolacionUnica(error)) return false;
        throw error;
      }
    },

    /** Cambia la contraseña y cierra sus sesiones abiertas. false si no existe. */
    cambiarClave(usuario: string, claveHash: string): boolean {
      const cambios = Number(sqlClaveModerador.run(claveHash, usuario).changes);
      sqlBorrarSesionesDe.run(usuario);
      return cambios > 0;
    },

    /**
     * Elimina un moderador. Si ya registró ingresos no se puede (el historial los referencia):
     * en ese caso conviene desactivarlo. Devuelve 'ok', 'no_existe' o 'con_ingresos'.
     */
    eliminarModerador(usuario: string): 'ok' | 'no_existe' | 'con_ingresos' {
      if (Number((sqlTieneIngresos.get(usuario) as { n: number }).n) > 0) return 'con_ingresos';
      return Number(sqlEliminarModerador.run(usuario).changes) > 0 ? 'ok' : 'no_existe';
    },

    /** Activa o desactiva (desactivar cierra sus sesiones). false si no existe. */
    activarModerador(usuario: string, activo: boolean): boolean {
      const cambios = Number(sqlActivarModerador.run(activo ? 1 : 0, usuario).changes);
      if (!activo) sqlBorrarSesionesDe.run(usuario);
      return cambios > 0;
    },

    // ── Sesiones ─────────────────────────────────────────────────────

    crearSesion(tokenHash: string, moderadorId: number, expiraEn: number): void {
      sqlCrearSesion.run(tokenHash, moderadorId, expiraEn);
    },

    sesion(tokenHash: string): { id: number; usuario: string; nombre: string; demo: boolean } | null {
      const f = sqlSesion.get(tokenHash, Date.now()) as Record<string, unknown> | undefined;
      return f ? { id: Number(f.id), usuario: String(f.usuario), nombre: String(f.nombre), demo: Number(f.demo) === 1 } : null;
    },

    borrarSesion(tokenHash: string): void {
      sqlBorrarSesion.run(tokenHash);
    },

    limpiarSesiones(): void {
      sqlLimpiarSesiones.run(Date.now());
    },

    // ── Ingresos (validación de boletos) ─────────────────────────────

    ingresosDe(inscripcionId: number): FilaIngreso[] {
      return (sqlIngresosDe.all(inscripcionId) as Array<Record<string, unknown>>).map(aIngreso);
    },

    /** true si se registró ahora; false si ya estaba registrado en ese punto (concurrencia segura: UNIQUE). */
    registrarIngreso(inscripcionId: number, punto: string, moderadorId: number): boolean {
      return Number(sqlRegistrarIngreso.run(inscripcionId, punto, moderadorId).changes) > 0;
    },

    /** Borra un ingreso solo si lo registró ese moderador después de `desdeIso`. true si se borró. */
    deshacerIngreso(inscripcionId: number, punto: string, moderadorId: number, desdeIso: string): boolean {
      return Number(sqlDeshacerIngreso.run(inscripcionId, punto, moderadorId, desdeIso).changes) > 0;
    },

    contarIngresos(): Map<string, number> {
      const filas = sqlContarIngresos.all() as Array<{ punto: string; n: number }>;
      return new Map(filas.map((f) => [String(f.punto), Number(f.n)]));
    },

    listarIngresos(): FilaIngreso[] {
      return (sqlListarIngresos.all() as Array<Record<string, unknown>>).map(aIngreso);
    },

    cerrar(): void {
      db.close();
    },
  };
}

export type BaseDeDatos = ReturnType<typeof abrirBaseDeDatos>;
