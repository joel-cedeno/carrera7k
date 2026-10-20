/**
 * Corrige el reloj del navegador con la hora del servidor, para que la cuenta regresiva
 * sea la misma para todos aunque el equipo tenga la hora desajustada.
 */
let desfase = 0;

export function sincronizarReloj(horaServidorMs: number): void {
  desfase = horaServidorMs - Date.now();
}

export function ahora(): number {
  return Date.now() + desfase;
}
