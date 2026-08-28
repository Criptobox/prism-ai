/** Prism AI — Voz: dictado (SpeechRecognition) y lectura (speechSynthesis).
 * Ambas APIs son nativas del navegador, gratis y 100% locales.
 */

// ——— tipos mínimos de Web Speech API (no incluidos en todos los lib.dom) ———

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechToTextSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface DictationHandlers {
  /** texto provisional mientras se habla */
  onPartial?: (text: string) => void;
  /** texto final reconocido */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

const DICTATION_ERRORS: Record<string, string> = {
  "not-allowed": "Permiso de micrófono denegado. Actívalo en tu navegador.",
  "service-not-allowed": "El servicio de reconocimiento no está permitido en este navegador.",
  "no-speech": "No se detectó voz. Inténtalo de nuevo.",
  "audio-capture": "No se encontró micrófono.",
  network: "Error de red durante el reconocimiento de voz.",
  aborted: "",
};

/** Inicia el dictado en español. Devuelve un controlador para detenerlo. */
export function startDictation(handlers: DictationHandlers): {
  stop: () => void;
} {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    handlers.onError?.(
      "Tu navegador no soporta dictado por voz. Prueba Chrome, Edge o Safari."
    );
    handlers.onEnd?.();
    return { stop: () => {} };
  }
  const rec = new Ctor();
  rec.lang = "es-ES";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = (ev) => {
    let partial = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      const text = res[0]?.transcript ?? "";
      if (res.isFinal) {
        const clean = text.trim();
        if (clean) handlers.onFinal(clean);
      } else {
        partial += text;
      }
    }
    handlers.onPartial?.(partial.trim());
  };
  rec.onerror = (ev) => {
    const msg = DICTATION_ERRORS[ev.error ?? ""] ?? "Error de reconocimiento de voz.";
    if (msg) handlers.onError?.(msg);
  };
  rec.onend = () => handlers.onEnd?.();

  try {
    rec.start();
  } catch {
    handlers.onError?.("No se pudo iniciar el micrófono.");
    handlers.onEnd?.();
  }
  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ya estaba detenido */
      }
    },
  };
}

// ——— lectura en voz alta (TTS) ———

/** Quita bloques de código, markdown y URLs para una lectura natural */
export function stripForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " (bloque de código omitido) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/^\s*[-*+]\s+/gm, ", ")
    .replace(/^\s*>\s?/gm, "")
    .replace(/https?:\/\/\S+/g, "enlace")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("es") && /google|natural/i.test(v.name)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("es")) ??
    voices[0] ??
    null
  );
}

export interface SpeakOptions {
  text: string;
  /** se avisa al terminar o cancelar */
  onEnd?: () => void;
}

/** Lee un texto en voz alta (es-ES). Cancela cualquier lectura previa. */
export function speak({ text, onEnd }: SpeakOptions): void {
  if (!ttsSupported() || !text) {
    onEnd?.();
    return;
  }
  stopSpeaking();
  const synth = window.speechSynthesis;
  const utter = new SpeechSynthesisUtterance(stripForSpeech(text).slice(0, 6000));
  utter.lang = "es-ES";
  const voice = pickSpanishVoice();
  if (voice) utter.voice = voice;
  utter.rate = 1.02;
  utter.pitch = 1;
  utter.onend = () => onEnd?.();
  utter.onerror = () => onEnd?.();
  // en Chrome las voces cargan de forma asíncrona: reintentar una vez si hace falta
  if (!synth.getVoices().length) {
    synth.onvoiceschanged = () => {
      const v = pickSpanishVoice();
      if (v) utter.voice = v;
      synth.onvoiceschanged = null;
    };
  }
  synth.speak(utter);
}

/** Detiene cualquier lectura en curso */
export function stopSpeaking(): void {
  if (!ttsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* sin lecturas activas */
  }
}
