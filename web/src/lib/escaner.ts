/**
 * Lector de QR con la cámara del dispositivo.
 *  - Usa BarcodeDetector (nativo, rápido) si el navegador lo trae (Chrome/Edge en Android).
 *  - Si no (iPhone, Firefox, la mayoría de escritorios), carga jsQR bajo demanda.
 * Requiere HTTPS (o localhost) y el permiso de cámara.
 */

interface DetectorNativo {
  detect(fuente: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface ConstructorDetector {
  new (opciones: { formats: string[] }): DetectorNativo;
  getSupportedFormats(): Promise<string[]>;
}

type Decodificador = (video: HTMLVideoElement) => Promise<string | null>;

export type ErrorCamara = 'inseguro' | 'sin-camara' | 'denegada' | 'ocupada' | 'desconocido';

export const MENSAJES_CAMARA: Record<ErrorCamara, string> = {
  inseguro: 'La cámara solo funciona en una conexión segura (HTTPS). Usa la búsqueda manual.',
  'sin-camara': 'No encontramos una cámara en este dispositivo. Usa la búsqueda manual.',
  denegada: 'No hay permiso para usar la cámara. Actívalo en la configuración del navegador y vuelve a intentarlo.',
  ocupada: 'La cámara está siendo usada por otra aplicación. Ciérrala y vuelve a intentarlo.',
  desconocido: 'No se pudo iniciar la cámara. Vuelve a intentarlo o usa la búsqueda manual.',
};

const INTERVALO_MS = 120;
const LADO_MAX = 720; // se reduce el fotograma para decodificar más rápido
/** El mismo código se ignora mientras siga a la vista; vuelve a contar tras 2,5 s fuera de cámara. */
const REPETICION_MS = 2500;

async function crearDecodificador(): Promise<Decodificador> {
  const Nativo = (window as unknown as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
  if (Nativo) {
    try {
      if ((await Nativo.getSupportedFormats()).includes('qr_code')) {
        const detector = new Nativo({ formats: ['qr_code'] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // se usa jsQR
    }
  }

  const { default: jsQR } = await import('jsqr');
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas no disponible');
  return async (video) => {
    const escala = Math.min(1, LADO_MAX / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * escala);
    const h = Math.round(video.videoHeight * escala);
    if (!w || !h) return null;
    lienzo.width = w;
    lienzo.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return jsQR(data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

function clasificarError(error: unknown): ErrorCamara {
  const nombre = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') return 'denegada';
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'sin-camara';
  if (nombre === 'NotReadableError' || nombre === 'AbortError') return 'ocupada';
  return 'desconocido';
}

export interface Escaner {
  /** Empieza a leer. Rechaza con un ErrorCamara si no se puede usar la cámara. */
  iniciar(): Promise<void>;
  detener(): void;
  /** Deja de leer sin apagar la cámara (mientras se muestra un resultado). */
  pausar(): void;
  reanudar(): void;
  readonly activo: boolean;
}

export function crearEscaner(video: HTMLVideoElement, alLeer: (texto: string) => void): Escaner {
  let flujo: MediaStream | null = null;
  let decodificar: Decodificador | null = null;
  let temporizador: number | undefined;
  let pausado = false;
  let ultimo = { texto: '', cuando: 0 };

  const ciclo = async (): Promise<void> => {
    if (!flujo) return;
    if (!pausado && decodificar && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        const texto = await decodificar(video);
        const ahora = Date.now();
        if (texto && texto === ultimo.texto && ahora - ultimo.cuando < REPETICION_MS) {
          ultimo.cuando = ahora;
        } else if (texto) {
          ultimo = { texto, cuando: ahora };
          alLeer(texto);
        }
      } catch {
        // fotograma ilegible: se intenta con el siguiente
      }
    }
    if (flujo) temporizador = window.setTimeout(ciclo, INTERVALO_MS);
  };

  return {
    get activo() {
      return flujo !== null;
    },

    async iniciar() {
      if (flujo) return;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw 'inseguro' satisfies ErrorCamara;
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (error) {
        throw clasificarError(error);
      }
      video.srcObject = flujo;
      video.setAttribute('playsinline', ''); // iPhone: sin pantalla completa
      video.muted = true;
      await video.play().catch(() => undefined);
      decodificar ??= await crearDecodificador();
      pausado = false;
      // El último boleto leído puede seguir frente a la cámara al reactivarla: no se relee hasta que salga de cuadro.
      ultimo.cuando = Date.now();
      void ciclo();
    },

    detener() {
      window.clearTimeout(temporizador);
      flujo?.getTracks().forEach((pista) => pista.stop());
      flujo = null;
      video.srcObject = null;
    },

    pausar() {
      pausado = true;
    },

    reanudar() {
      pausado = false;
      // El boleto recién atendido puede seguir frente a la cámara: no se relee hasta que salga de cuadro.
      ultimo.cuando = Date.now();
    },
  };
}
