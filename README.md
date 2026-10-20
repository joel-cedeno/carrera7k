# Carrera Atlética 7K · Landing e inscripciones

Landing informativa e inscripción en línea de la **Carrera Atlética 7K – Únete contra la violencia a la mujer**
(Ministerio de Gobierno, domingo 15 de noviembre de 2026, Quito).

- **Sin framework**: TypeScript en el navegador y en el servidor.
- **Base de datos ligera**: SQLite integrado en Node (`node:sqlite`): un solo archivo, sin servidor de BD aparte.
  Con 2.000 inscripciones es más que suficiente.
- **Tiempo real**: los cupos disponibles se actualizan en todas las pantallas abiertas al instante
  (Server-Sent Events). Si el canal falla, el navegador consulta cada 15 s.
- **Sin dependencias en producción**: solo Node ≥ 22.13. `esbuild` y `typescript` son herramientas de desarrollo; las librerías de QR (`uqr`, `jsqr`) quedan empaquetadas en la compilación.

## Uso

```bash
npm install
npm run dev        # desarrollo: http://127.0.0.1:5173, recompila y reinicia al guardar
npm run build      # verificación de tipos + compilación de producción
npm start          # servidor de producción (lee .env si existe)
npm run exportar   # CSV de inscripciones en data/exportaciones/ (Excel: npm run exportar -- --separador=";")
npm run moderadores -- agregar <usuario> "<Nombre>"   # moderadores del día del evento (ver «Boletos con QR»)
npm run qr-sitio -- --url=https://<dirección-pública>/  # QR del sitio para afiches → data/qr/qr-sitio.svg
```

Configuración: copia `.env.example` a `.env`. Ahí están los cupos, la ventana de fechas de inscripción,
el límite por IP y la ruta de la base de datos.

## Estructura

```
shared/inscripcion.ts   Modelo y validación de la ficha (la usan navegador y servidor)
shared/boleto.ts        Formato del token del boleto y tipos del API de validación
shared/qr.ts            Generación de QR (la usan el boleto en el navegador y el QR del sitio)
server/                 Servidor HTTP: API, SQLite, tiempo real, archivos estáticos, exportación CSV
web/                    Sitio público
  index.html            Landing
  inscripcion.html      Ficha de inscripción (la confirmación incluye el boleto con QR)
  boleto.html           «Mi boleto»: recuperar el boleto con cédula + fecha de nacimiento
  verificar.html        Lector de boletos (consulta pública y modo moderador)
  css/tokens.css        ÚNICO lugar con colores, tipografías e imágenes de marca
  css/base.css          Componentes compartidos y animaciones base
  css/landing.css, css/form.css
  assets/               Imágenes del cliente (ver assets/README.md)
  src/                  TypeScript del navegador → web/dist (generado)
scripts/build.mjs       Compilación con esbuild
data/                   Base de datos y exportaciones (no versionar)
```

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/estado` | Cupos, estado (`abiertas`, `proximamente`, `cerradas`, `agotadas`) y hora del servidor |
| GET | `/api/estado/stream` | Mismo estado en tiempo real (Server-Sent Events) |
| POST | `/api/inscripciones` | Registra una ficha (JSON). 201, 422 validación, 409 duplicado/agotadas, 403 fuera de fechas, 429 límite |
| GET | `/api/salud` | Comprobación de funcionamiento |
| POST | `/api/boletos/verificar` | Consulta pública de un boleto: `{ valido, codigo }`, sin datos personales |
| POST | `/api/boletos/recuperar` | Boleto a partir de cédula + fecha de nacimiento (10 intentos / 10 min por IP) |
| GET | `/api/boletos/clave-publica` | Clave pública Ed25519 (para una futura validación sin conexión) |
| GET · POST · DELETE | `/api/moderacion/sesion` | Sesión del moderador (cookie HttpOnly, SameSite=Strict) |
| POST | `/api/moderacion/consultar` | Datos del participante por token del QR o búsqueda (código o cédula) |
| POST | `/api/moderacion/ingresos` | Registra el ingreso en un punto de control; `nuevo: false` si el boleto ya se usó |
| GET | `/api/moderacion/resumen` | Ingresos por punto de control |

## Reglas de negocio

- Edad sugerida de 13 a 69 años (documento de la carrera, 5.1). Desde el 20-10-2026 es una **sugerencia, no un
  impedimento**: fuera de ese rango el formulario muestra un aviso, pero permite inscribirse. La edad la calcula el
  servidor a la fecha de inscripción (hora de Ecuador).
- 2.000 cupos (antes 1.500). El conteo y el registro ocurren en una sola transacción: nunca se supera el total, aunque lleguen solicitudes simultáneas.
- Una inscripción por cédula/pasaporte (se ignoran espacios, puntos y mayúsculas al comparar).
- La fecha de inscripción la fija el servidor; el código de inscripción tiene la forma `7K-0001`.

## Boletos con QR y validación el día del evento

1. **Boleto.** Al inscribirse, la persona ve su boleto con un QR y lo puede descargar como imagen (PNG) o imprimir.
   Si lo pierde, lo recupera en `/boleto` con su cédula y su fecha de nacimiento. Las inscripciones anteriores a
   esta función también tienen boleto: se genera al recuperarlo.
2. **Contenido del QR.** Es la dirección `…/verificar#t=<token>`. El token es `7K1.<n.º de inscripción>.<firma>`
   (o `7K2.<n.º>.<versión>.<firma>` si el boleto se reemitió), firmado con Ed25519 por el servidor. Con `URL_PUBLICA`
   definida, el QR usa siempre esa dirección; sin ella, la dirección desde la que se abrió la página. El QR lleva
   corrección de errores Q (25 %): se lee con la pantalla rayada o el papel arrugado.
3. **Consulta pública** (`/verificar`, sin sesión). Cualquiera que escanee el QR, incluso con la cámara normal del
   celular, ve si el boleto es válido y su código. **No se muestran datos personales.**
4. **Modo moderador** (`/verificar` con sesión). Muestra nombre, edad y los últimos 4 dígitos del documento, para
   cotejar con la cédula, y permite **confirmar el ingreso** en el punto de control elegido. Un segundo escaneo del
   mismo boleto en ese punto avisa «Boleto ya utilizado», con hora y moderador. También admite búsqueda manual por
   código o cédula, por si el QR no se lee.
5. **Puntos de control.** Se configuran en `PUNTOS_CONTROL`. Por defecto son «Entrega de kit» e «Ingreso a la salida».
   El CSV de `npm run exportar` añade una columna por punto, con la fecha y el moderador.

### Integridad del boleto

- **No se puede falsificar:** la firma Ed25519 cubre el número de inscripción y la versión. Se comprobó alterando cada
  carácter de un token: se rechazan todas las variantes. La firma solo se acepta escrita en su forma canónica.
- **Es válido solo si:** la firma es auténtica, la inscripción existe y el boleto es la versión vigente.
- **No caduca:** los tokens no tienen fecha de vencimiento y el servidor acepta todos los formatos emitidos (`7K1`,
  `7K2`). Las librerías de QR van empaquetadas en la compilación: no dependen de servicios externos.
- **La clave no se puede perder por separado:** vive dentro de la base de datos (tabla `ajustes`), así que **respaldar
  `data/inscripciones.db` respalda también la clave**. Nunca se reemplaza: si `BOLETOS_CLAVE` apunta a un archivo con
  otra clave, el servidor no arranca, en lugar de invalidar en silencio los boletos emitidos. Al arrancar se
  autocomprueba la firma y se muestra la huella de la clave.
- **La base de datos** (datos personales y clave) queda con permisos `600`: solo la lee el usuario del servidor.
- **Boleto filtrado o robado:** se reemite y el anterior deja de valer (el lector muestra «Boleto anulado»). La persona
  descarga el nuevo en «Mi boleto».
- **Un uso por punto de control:** cuando el moderador confirma el ingreso, ese boleto ya no vuelve a pasar en ese
  punto (otro moderador verá «Boleto ya utilizado», con hora y quién lo registró).

```bash
npm run boletos -- verificar "<token o dirección leída del QR>"   # diagnóstico completo de un boleto
npm run boletos -- reemitir 7K-0001                               # anula el boleto vigente
npm run boletos -- clave                                          # huella y clave pública
```

Moderadores (aún no se conocen las personas: se crean cuando el cliente las defina):

```bash
npm run moderadores -- agregar jperez "Juan Pérez"   # pide la contraseña (mínimo 10 caracteres)
npm run moderadores -- listar
npm run moderadores -- clave jperez                  # cambia la contraseña y cierra sus sesiones
npm run moderadores -- desactivar jperez             # bloquea el acceso y cierra sus sesiones
npm run moderadores -- eliminar jperez               # solo si no registró ingresos
npm run moderadores -- demo                          # cuenta de PRUEBA admin / 1234 (solo desde la red local)
```

La cuenta de demostración solo inicia sesión desde el propio equipo o la red local (nunca desde internet), y el
servidor avisa al arrancar mientras exista. **Elimínala antes de publicar:** `npm run moderadores -- eliminar admin`.

Lector y cámara:

- La cámara del navegador **solo funciona con HTTPS** (o en `localhost` / `127.0.0.1`). En la red local por `http://`,
  el lector muestra el aviso y queda la búsqueda manual.
- En Chrome/Edge de Android se usa el lector nativo (`BarcodeDetector`). En iPhone y Firefox se carga jsQR bajo
  demanda (~130 KB, solo en `/verificar`).
- Solo `/verificar` puede usar la cámara (`Permissions-Policy: camera=(self)`); el resto del sitio la bloquea.

**Respaldo:** basta con respaldar la base de datos (incluye la clave de firma). Si existía
`data/boletos-ed25519.pem` de una versión anterior, se importó automáticamente; puede conservarse como copia.

## Despliegue

- Un único proceso Node con disco persistente para `data/` (no apto para plataformas serverless sin disco).
- Recomendado detrás de un proxy con HTTPS (nginx/Caddy) con `TRUST_PROXY=1`. Para SSE, desactivar el buffering
  del proxy en `/api/estado/stream` (el servidor ya envía `X-Accel-Buffering: no` para nginx).
- Respaldo: copiar `data/inscripciones.db` (o `sqlite3 data/inscripciones.db ".backup respaldo.db"`).
- **Mapa del recorrido:** Leaflet (empaquetado) con el mapa base de OpenStreetMap, sin clave de API. La CSP permite
  imágenes de `https://tile.openstreetmap.org` (nada más externo). El trazado está en `web/src/lib/ruta-7k.ts`
  (Av. Río Amazonas según OpenStreetMap, entre los extremos del enlace de Google Maps del cliente); si la organización
  entrega el trazado oficial (GPX/KML), se reemplaza esa lista.
- El servidor envía una CSP estricta (`'self'`). Si el cliente pide fuentes o imágenes externas, ajustar
  `CABECERAS_SEGURIDAD` en `server/index.ts`.
