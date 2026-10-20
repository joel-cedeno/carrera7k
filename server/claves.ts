import crypto from 'node:crypto';

/** Contraseñas de moderadores: scrypt con sal aleatoria. Formato: `scrypt$N$r$p$sal$hash` (base64url). */

const N = 16384;
const R = 8;
const P = 1;
const LARGO = 32;

export const CLAVE_MIN = 10;

export function hashClave(clave: string): string {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(clave.normalize('NFC'), sal, LARGO, { N, r: R, p: P });
  return ['scrypt', N, R, P, sal.toString('base64url'), hash.toString('base64url')].join('$');
}

export function verificarClave(clave: string, guardado: string): boolean {
  const [tipo, n, r, p, sal, hash] = guardado.split('$');
  if (tipo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64url');
  const calculado = crypto.scryptSync(clave.normalize('NFC'), Buffer.from(sal, 'base64url'), esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(calculado, esperado);
}

/** Hash ficticio para comparar aunque el usuario no exista (mismo tiempo de respuesta). */
export const HASH_FICTICIO = hashClave(crypto.randomBytes(16).toString('hex'));

export const tokenAleatorio = (): string => crypto.randomBytes(32).toString('base64url');

export const sha256 = (texto: string): string => crypto.createHash('sha256').update(texto).digest('base64url');
