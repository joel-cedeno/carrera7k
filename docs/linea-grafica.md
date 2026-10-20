# Línea gráfica · Carrera 7K «Únete contra la violencia a la mujer»

Extraída del arte del cliente:

- `7K Carrera Web.svg`: composición **móvil** de 319 × 632,87 unidades. Es la **base de todos los estilos**.
- `7K Carrera Web.ai`: página 1, composición de **escritorio** de 1440 × 768. Solo sirve de **referencia de responsividad**.

Las vistas renderizadas están en `docs/referencias/`:

- `movil-319x633.png` (×3)
- `escritorio-1440x768.png` (×1,25)

> En el SVG todo el texto está convertido a trazos. Los textos, fuentes y colores de abajo salen del .ai (texto vivo)
> y del SVG (geometría y colores). En la web **todo texto debe ser HTML real** (accesible, traducible, indexable).
> Las únicas excepciones son los logotipos.

## Paleta

| Token sugerido | Valor | Uso en el arte |
| --- | --- | --- |
| `--morado-noche` | `#290055` | Fondo de toda la pieza. También es el relleno de la silueta de la corredora |
| `--morado-1` → `--morado-2` | `#5c22ad` → `#8921d0` | Botón «Inscríbete Aquí» (degradado vertical: `#8921d0` arriba, `#5c22ad` abajo) y puntos de la trama |
| `--k-1` → `--k-2` | `#8d00a4` → `#ad20e8` | Cuerpo de la «K» (degradado horizontal, de izquierda a derecha) |
| `--k-brillo-1` → `--k-brillo-2` | `#ac00cd` → `#e200dd` | Brillo diagonal de la «K» (de abajo-izquierda hacia arriba-derecha) |
| `--magenta` | `#ae019c` | Recuadro de la fecha: degradado diagonal de `#ae019c` opaco (arriba-izquierda) a transparente (abajo-derecha), con paradas de opacidad 1 · .98 · .91 · .8 · .65 · .45 · .22 · 0 |
| `--fucsia` | `#ce00ff` | Resaltado de «LA MUJER» |
| `--amarillo` | `#fcc40d` | «NOV», «2026», «Inscríbete Aquí» y el reloj |
| `--blanco` | `#ffffff` | «7», «ÚNETE», «15», «07:00», textos y logotipos |

No hay grises ni otros colores de interfaz en el arte. Para los estados (error, éxito, aviso) derivar tonos que
contrasten sobre `#290055` (AA). Por ejemplo, error: rosa claro sobre morado; éxito: verde menta.

## Tipografías

Están autoalojadas en `web/assets/fuentes/` (licencias OFL e Unlicense; los textos de licencia están en la misma carpeta).

| Familia | Peso | Archivo | Uso en el arte |
| --- | --- | --- | --- |
| Poppins | Black 900 | `poppins-900.woff2` | «15», «NOV», «2026» (cifras del recuadro de fecha) |
| Metropolis | Bold 700 | `metropolis-700.woff2` | «07:00», «Inscríbete Aquí», «Ministerio de Gobierno» |
| Metropolis | Regular 400 | `metropolis-400.woff2` | «Con el apoyo de:» y texto corrido |

«ÚNETE» y «CONTRA LA VIOLENCIA A LA MUJER» son parte del logotipo (trazos), no texto.

## Tamaños

### Móvil (base 319 de ancho)

Los valores son unidades del SVG, equivalentes a px a 319 de ancho. Hay que escalarlos de forma fluida.

| Elemento | Tamaño | Posición (x, y, ancho × alto) |
| --- | --- | --- |
| Logo 7K ÚNETE | — | 52,8 · 37 · 213,8 × 159,2 (≈ 67 % del ancho, centrado) |
| Recuadro de fecha | «15» 50 · «NOV» 21,4 · «2026» 23,4 (vertical, lectura de abajo hacia arriba) | 123,1 · 233,9 · 85,8 × 66,9 |
| Reloj + «07:00» | reloj 25,2 · texto 18,7 | 117,9 · 308 · 88,8 × 25,2 (centrado) |
| Botón «Inscríbete Aquí» | texto 20,7 · radio 12 | 64 · 362,9 · 189,8 × 38,9 (≈ 60 % del ancho, centrado) |
| «Con el apoyo de:» | 8 | x 17,3 · y 442,7 (alineado a la izquierda) |
| Fila de aliados | — | y 459–494; ver los cuatro logos más abajo |
| Logo Gobierno del Ecuador | — | 103,2 · 530,6 · 117,3 × 39,6 (centrado) |
| Línea separadora | blanca, 1,5 de grosor | x 91–232 · y 579 |
| «Ministerio de Gobierno» | 8 | centrado, y ≈ 590 |
| Trama de puntos | — | ocupa 0–323 de alto (la mitad superior) y se desvanece hacia abajo |

Posiciones de los cuatro aliados:

| Aliado | Inicio x | Ancho × alto |
| --- | --- | --- |
| Empresa Segura | 17,9 | 57,5 × 26 |
| Cooperación alemana / GIZ | 89,3 | 70,5 × 27,8 |
| PreViMujer | 173,5 | 66,6 × 22,5 |
| Mujeres sin Violencia | 261,7 | 41,8 × 34,7 |

### Escritorio (referencia, 1440 × 768)

- **Dos columnas en el primer pantallazo:**
  - Columna izquierda: el logo 7K ÚNETE, x ≈ 370–812, y ≈ 84–400.
  - Columna derecha: el recuadro de fecha (x ≈ 932–1110, y ≈ 140–278) y debajo el reloj con «07:00» (y ≈ 292–344).
- **Botón «Inscríbete Aquí»:** centrado en la página, x ≈ 549–936, y ≈ 457–535. Su texto mide ≈ 43.
- **Franja inferior:**
  - A la izquierda, «Con el apoyo de:» (≈ 19) y la fila de cuatro aliados (y ≈ 652–720).
  - A la derecha, el logo del Gobierno del Ecuador, una **línea vertical** blanca y «Ministerio de / Gobierno» en dos líneas, Metropolis Bold ≈ 19.
- **Tamaños de las cifras:** «15» ≈ 103, «NOV» ≈ 44, «2026» ≈ 47, «07:00» ≈ 38.
- **Trama de puntos:** cubre casi todo el alto y se desvanece hacia abajo.

### Cómo lo lleva la web (hero de `index.html`, 19-10-2026)

El hero parte del .ai pero integra más contenido, todo colgado de un único eje vertical y ocupando el primer
pantallazo (`100svh − barra`) desde 64rem:

1. **Logo 7K + fecha y hora**, tratados como un solo grupo centrado en el eje de la página (separación
   `--hero-col-gap`). El bloque de fecha mide exactamente lo mismo de alto que el logo: el recuadro «15 NOV 2026»
   arranca en el borde superior del logo y la fila «reloj + 07:00» termina en su base (`--fecha-fs = 0,298 × ancho
   del logo`; el `viewBox` del SVG inline está ajustado al dibujo visible: `52.3 43.6 214.8 153.1`).
2. **Inscríbete Aquí + Conoce la carrera**, a su tamaño natural, de la misma altura, lado a lado y centrados como
   pareja (el primero, botón del arte y acción principal, en una sola línea; el segundo, fantasma).
3. **Cuenta regresiva | cupos en vivo**, dos columnas iguales (56rem) con un filete vertical sobre el eje.
4. **Pie:** logo del Ministerio centrado, rótulo «Con el apoyo de» entre dos filetes y los cuatro aliados.

En el resto de la página **no hay guiones ni trazos decorativos** (ni delante de los antetítulos, ni sobre los h2,
ni en las tarjetas) y las secciones se separan solo por la alternancia de color de fondo (`.section` /
`.section--alt`), sin líneas; el aire vertical de todas es `--section-pad` = `clamp(3rem, 2rem + 4vw, 5rem)`
(cambio del cliente, 19-10-2026). Los únicos filetes son los del hero (blancos al 32 %).

En móvil y tablet (< 64rem) todo es una columna centrada (en tablet, logo | fecha y los dos botones van en fila).
Los altos (logo, fecha, botón, cifras, Ministerio, aliados) se atan al alto de la ventana para caber a 1440 × 768,
1366 × 768, 1280 × 720 y 1024 × 768. La sección «Convocatoria» que sigue es una columna centrada (antetítulo,
título, lema, mensaje rotativo, texto y tres datos en fila).

## Trama de puntos

- **Geometría:** cuadrícula regular de 18,64 (horizontal) × 14,54 (vertical). Hay 22 filas desde y = 11,97.
- **Tamaño de los puntos:** el radio decrece de forma lineal de 6,86 (arriba) a 1,66 (abajo), así que la trama se desvanece hacia abajo.
- **Color:** degradado vertical de `#8921d0` (arriba) a `#5c22ad` (abajo), con opacidad 0,37.
- **Recurso:** `web/assets/marca/trama-puntos.svg` es una baldosa de una columna (18,64 × 325,31) que se repite en horizontal.

## Recursos (`web/assets/marca/`)

Todos los SVG están **sin `<style>`**: las clases de Illustrator se convirtieron en atributos de presentación. Así se
pueden **incrustar en el HTML** sin chocar con la CSP del servidor (`style-src 'self'`), y animar por capas desde CSS.

| Archivo | Contenido | Uso recomendado |
| --- | --- | --- |
| `logo-7k-unete.svg` | Logo completo con capas | **Incrustado (inline)** para animarlo |
| `reloj.svg` | Ícono del reloj amarillo (un solo trazo: esfera y agujas calados) | Inline o `<img>` |
| `trama-puntos.svg` | Baldosa de la trama | `background-image` |
| `aliado-empresa-segura.svg` | Logo de aliado | `<img alt="Empresa Segura">` |
| `aliado-cooperacion-alemana-giz.svg` | Logo de aliado (225 KB, conviene optimizarlo con SVGO más adelante) | `<img alt="Cooperación alemana – GIZ">` |
| `aliado-previmujer.svg` | Logo de aliado | `<img alt="PreViMujer">` |
| `aliado-mujeres-sin-violencia.svg` | Logo de aliado | `<img alt="Mujeres sin Violencia – ¡Así gana Ecuador!">` |
| `ministerio-blanco-horizontal.png` · `ministerio-blanco-vertical.png` | Logo oficial actualizado «Gobierno del Ecuador \| Ministerio de Gobierno» (PNG blanco del cliente, 19-10-2026; 455 × 113 y 412 × 206 tras recortar los márgenes transparentes a 12 px). Sustituye al escudo extraído del SVG. Sin SVG: no ampliarlo más de ~1,2× | `<picture>`: vertical hasta 48rem, horizontal desde 48rem. Va en un solo sitio: el **pie del hero**, centrado en el mismo eje que «Con el apoyo de» y los aliados, **encima** de ellos, separado y claramente más grande (≈ 384 px de ancho a 1440 × 768; cambio del cliente, 19-10-2026: composición simétrica y logo «más grande»). «Con el apoyo de» va como rótulo entre dos filetes sobre los aliados. Ya no se repite en la sección «Convocatoria» |

Clases de capa dentro de `logo-7k-unete.svg`, para animar:

| Clase | Capa |
| --- | --- |
| `.logo7k__marca` | Grupo del «7K» con la corredora |
| `.logo7k__siete` | El «7» blanco |
| `.logo7k__k` | Cuerpo de la «K» con degradado |
| `.logo7k__k-brillo` | Brillo diagonal de la «K» |
| `.logo7k__corredora` | Silueta de la corredora (rellena con el color de fondo) |
| `.logo7k__unete` | Grupo «ÚNETE», con cinco hijos `.logo7k__letra` (Ú, N, E, T, E) |
| `.logo7k__resaltado` | Rectángulo fucsia detrás de «LA MUJER» |
| `.logo7k__lema` | Grupo del lema: 18 hijos `.logo7k__lema-contra` («CONTRA LA VIOLENCIA A») y 7 `.logo7k__lema-mujer` («LA MUJER») |

## Textos del arte

- `15` / `NOV` / `2026`
- `07:00`
- `Inscríbete Aquí`
- `Con el apoyo de:`
- `Ministerio de Gobierno`

El logo se lee como «7K Únete contra la violencia a la mujer».
