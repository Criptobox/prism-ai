/** Prism AI — Lector de Excel en un hilo aparte y desechable.
 *
 * `xlsx` (SheetJS) arrastra dos vulnerabilidades altas sin arreglo en npm:
 * contaminación de prototipos y un ReDoS. Las dos se disparan al LEER un
 * archivo preparado.
 *
 * En una app normal eso sería «que el usuario abra lo que quiera». Aquí no:
 * Prism guarda las claves API en el dispositivo, y contaminar
 * `Object.prototype` del hilo principal pone en riesgo justo la promesa del
 * producto. Así que el archivo se abre en un Worker:
 *
 *   · Tiene su propio realm: lo que se contamine aquí NO toca al de la app.
 *   · Se crea por archivo y se destruye al terminar; la contaminación muere
 *     con él.
 *   · Un ReDoS cuelga este hilo, no la interfaz, y el llamador lo mata por
 *     tiempo.
 *
 * De aquí solo sale texto: una matriz de cadenas. Ningún objeto del parser
 * cruza al hilo principal.
 */
export interface PeticionHoja {
  buffer: ArrayBuffer;
}
export interface RespuestaHoja {
  ok: boolean;
  hojas?: { name: string; rows: string[][] }[];
  error?: string;
}

self.onmessage = async (e: MessageEvent<PeticionHoja>) => {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(e.data.buffer, { type: "array" });
    const hojas = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        blankrows: false,
        defval: "",
        raw: false,
      });
      return {
        name,
        // a texto AQUÍ dentro: lo que cruza al hilo principal son cadenas,
        // nunca objetos salidos del parser
        rows: (rows as unknown[][])
          .map((r) => r.map((c) => (c == null ? "" : String(c))))
          .filter((r) => r.some((c) => c.trim() !== "")),
      };
    });
    (self as unknown as Worker).postMessage({ ok: true, hojas } satisfies RespuestaHoja);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo leer la hoja",
    } satisfies RespuestaHoja);
  }
};
