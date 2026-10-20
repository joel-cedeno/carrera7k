# Recursos de marca

La marca ya está definida: sale del arte del cliente (`7K Carrera Web.svg` y
`7K Carrera Web.ai`) y está documentada en **`docs/linea-grafica.md`** (paleta,
tipografías, tamaños, trama de puntos y capas del logo). Las vistas de
referencia están en `docs/referencias/` (`movil-319x633.png` y
`escritorio-1440x768.png`).

Todos los valores de marca viven en **`web/css/tokens.css`** (único tema oscuro,
sin modo claro). Las demás hojas (`base.css`, `landing.css`, `form.css`) solo
usan esas variables.

## Dónde está cada recurso

### `marca/` — logotipos y trama (SVG sin `<style>`, compatibles con la CSP)

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `logo-7k-unete.svg` | Logo completo por capas (`.logo7k__siete`, `.logo7k__k`, `.logo7k__corredora`, `.logo7k__letra`, `.logo7k__resaltado`, `.logo7k__lema`…) | **Incrustado** en `index.html` como `<h1>` del hero (así se anima por capas desde `landing.css`). Como `<img>` en la barra superior y en la cabecera de `inscripcion.html`. |
| `reloj.svg` | Ícono original del reloj amarillo | Referencia. En el hero el reloj está **redibujado en SVG inline** (`.reloj`, en `index.html`) con agujas marcando las 7:00 y segundero animado. |
| `trama-puntos.svg` | Baldosa de la trama (1 columna, 325 de alto, radio decreciente) | `--trama-movil` en `tokens.css`: hero en móvil/tablet, cabecera del formulario, banda final y tarjetas de mensajes. Se repite en horizontal (`repeat-x`). |
| `trama-puntos-escritorio.svg` | Misma cuadrícula extendida a 768 de alto (52 filas) | `--trama-escritorio`: hero desde 64rem, donde la trama cubre casi todo el primer pantallazo. |
| `aliado-empresa-segura.svg` · `aliado-cooperacion-alemana-giz.svg` · `aliado-previmujer.svg` · `aliado-mujeres-sin-violencia.svg` | Logos de los aliados | `<img alt="…">` en la fila «Con el apoyo de:» del hero. Sus alturas relativas se fijan en `landing.css` (`.aliados__item--*`). |
| `ministerio-blanco-horizontal.png` · `ministerio-blanco-vertical.png` | Logo oficial «Gobierno del Ecuador \| Ministerio de Gobierno» (PNG blanco del cliente, 455 × 113 y 412 × 206; son los originales con los márgenes transparentes recortados a 12 px para que se centren bien). No hay SVG ni versión mayor: **no mostrarlos a más de ~1,2× su tamaño nativo** (≈ 545 / 495 px de ancho). | `<picture>` en un solo sitio de `index.html`: el **pie del hero** (vertical hasta 48rem, horizontal desde 48rem), centrado **encima** del rótulo «Con el apoyo de» (entre dos filetes) y separado de los aliados, para que no se lea como un aliado más y sea claramente mayor que ellos (`.hero__ministerio`, ancho `--ministerio-w`: 24rem en móvil, limitado por el ancho de pantalla; 24–30rem en tablet; 50vh ≈ 384 px a 768 de alto en escritorio, con tope de 34rem ≈ 545 px). Ya no se repite en la sección «Convocatoria». |

Pendiente opcional: `aliado-cooperacion-alemana-giz.svg` (230 KB) admite optimización con SVGO.

### `fuentes/` — tipografías autoalojadas (woff2)

| Archivo | Familia y peso | Uso |
|---|---|---|
| `poppins-900.woff2` | Poppins Black | `--font-display`: cifras del recuadro de fecha, cuenta regresiva, cupos, titulares de sección y mensajes. |
| `metropolis-700.woff2` | Metropolis Bold | «07:00», botones «Inscríbete Aquí», «Ministerio de Gobierno», títulos secundarios, etiquetas. |
| `metropolis-400.woff2` | Metropolis Regular | `--font-sans`: texto corrido y «Con el apoyo de:». |

Los `@font-face` están al inicio de `tokens.css` (`font-display: swap`). Las
licencias (`LICENCIA-poppins.txt`, `LICENCIA-metropolis.txt`) van en la misma
carpeta. La CSP del servidor (`font-src 'self'`) solo permite fuentes de este
sitio: no usar CDN.

## Reglas para no romper la CSP

- Nada de `style="…"` ni `<style>` en el HTML ni en los SVG: los colores de los
  SVG van como atributos de presentación (`fill`, `stop-color`).
- Nada de scripts inline ni recursos externos.
- Si se reemplaza un SVG del cliente, limpiar antes sus `<style>` y clases de
  Illustrator (convertir a atributos) y conservar las clases `logo7k__*` si es
  el logo, porque `landing.css` las anima.

## Si cambia un color o una fuente

1. Editar la sección 1–3 de `tokens.css` (paleta del arte y roles).
2. Actualizar `<meta name="theme-color">` en `index.html` e `inscripcion.html`
   (hoy `#290055`).
3. Verificar contraste AA sobre `#290055` y sobre las tarjetas (`#35106e`).
