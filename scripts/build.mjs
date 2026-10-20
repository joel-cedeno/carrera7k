// Compila el navegador (web/src → web/dist) y el servidor (server → build) con esbuild.
//   node scripts/build.mjs           compilación de producción
//   node scripts/build.mjs --watch   desarrollo: recompila y reinicia el servidor al guardar
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const web = {
  entryPoints: ['web/src/landing.ts', 'web/src/inscripcion.ts', 'web/src/verificar.ts', 'web/src/boleto.ts'],
  outdir: 'web/dist',
  bundle: true,
  format: 'esm',
  // El lector de QR de respaldo (jsQR) se carga solo si el navegador no trae BarcodeDetector.
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
  minify: !watch,
  sourcemap: true,
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions} */
const server = {
  entryPoints: ['server/index.ts', 'server/exportar.ts', 'server/moderadores.ts', 'server/boletos-cli.ts', 'server/qr-sitio.ts'],
  outdir: 'build',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Se empaqueta todo (uqr incluido): en producción no hace falta node_modules.
  sourcemap: true,
  logLevel: 'info',
};

/** Hojas de estilo de terceros que se sirven tal cual desde el propio sitio (CSP: style-src 'self'). */
function copiarVendor() {
  fs.mkdirSync('web/dist/vendor', { recursive: true });
  fs.copyFileSync('node_modules/leaflet/dist/leaflet.css', 'web/dist/vendor/leaflet.css');
}

if (!watch) {
  // Los trozos llevan hash en el nombre: se limpia para no acumular versiones viejas.
  fs.rmSync('web/dist', { recursive: true, force: true });
  copiarVendor();
  await Promise.all([esbuild.build(web), esbuild.build(server)]);
} else {
  copiarVendor();
  let proceso = null;
  const reiniciar = () => {
    proceso?.kill('SIGTERM');
    proceso = spawn(process.execPath, ['--env-file-if-exists=.env', '--enable-source-maps', 'build/index.js'], {
      stdio: 'inherit',
    });
  };
  const reiniciarAlCompilar = {
    name: 'reiniciar-servidor',
    setup(build) {
      build.onEnd((r) => {
        if (r.errors.length === 0) reiniciar();
      });
    },
  };

  const ctxWeb = await esbuild.context(web);
  const ctxServer = await esbuild.context({ ...server, plugins: [reiniciarAlCompilar] });
  await Promise.all([ctxWeb.watch(), ctxServer.watch()]);

  const salir = async () => {
    proceso?.kill('SIGTERM');
    await Promise.all([ctxWeb.dispose(), ctxServer.dispose()]);
    process.exit(0);
  };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
