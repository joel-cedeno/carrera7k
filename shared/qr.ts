import { encode } from 'uqr';

export type NivelCorreccion = 'L' | 'M' | 'Q' | 'H';

export interface MatrizQr {
  /** Lado en módulos, incluido el margen. */
  lado: number;
  /** Trazado SVG de los módulos oscuros (un cuadrado de 1×1 por módulo, unidos por fila). */
  trazado: string;
  modulos: boolean[][];
}

/**
 * Codifica un texto como QR.
 * - Margen de 4 módulos: el mínimo del estándar para que los lectores lo encuentren.
 * - Corrección M (15 %) para boletos en pantalla; H (30 %) para impresos o con logo encima.
 */
export function generarQr(texto: string, nivel: NivelCorreccion = 'M'): MatrizQr {
  const { data } = encode(texto, { ecc: nivel, border: 4 });
  const partes: string[] = [];
  data.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      if (!fila[x]) {
        x++;
        continue;
      }
      const inicio = x;
      while (x < fila.length && fila[x]) x++;
      partes.push(`M${inicio} ${y}h${x - inicio}v1h${inicio - x}z`);
    }
  });
  return { lado: data.length, trazado: partes.join(''), modulos: data };
}

/** SVG completo (fondo blanco, módulos oscuros), para archivos descargables o impresos. */
export function qrComoSvg(texto: string, nivel: NivelCorreccion = 'M', color = '#000000'): string {
  const { lado, trazado } = generarQr(texto, nivel);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges">` +
    `<rect width="${lado}" height="${lado}" fill="#ffffff"/><path d="${trazado}" fill="${color}"/></svg>\n`
  );
}
