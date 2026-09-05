/** Prism AI — Caza de ofertas IA: las ofertas vigentes de los proveedores,
 * cazadas desde tu navegador.
 *
 * La idea: los planes gratuitos, los días de regalo y los créditos de
 * bienvenida existen, pero están desparramados por docenas de páginas y se
 * caducan sin avisar. Aquí viven en un catálogo que viaja CON la app (sin
 * servidor: no hay nada que rascar en vivo), se le puede sumar una fuente
 * JSON propia, y una comprobación diaria al arrancar avisa de lo nuevo y de
 * lo que está a punto de terminar.
 *
 * Regla de honestidad (contrato §5): solo se listan programas de larga vida
 * que el proveedor publica; lo que no se puede saber con certeza va como
 * texto sin cifras («la cuota exacta la publica el proveedor»), y cada
 * entrada lleva su fecha de verificación a la vista. Las promos relámpago
 * no van aquí: van por la fuente propia del usuario, que es quien las ve
 * y decide si fiarse.
 *
 * Este archivo es lógica pura (sin React ni DOM) para poder probarla en Node.
 * El store que persiste favoritas y ajustes vive en `ofertas-store.ts`.
 */

/** Los cinco tipos con los que se filtra y se pinta el badge. «descuento»
 * existe porque las fuentes propias lo traen; el catálogo base de programas
 * permanentes rara vez lo usa (los % concretos caducan demasiado rápido). */
export type TipoOferta = "gratis" | "dias" | "descuento" | "creditos" | "estudiantes";

export const TIPOS_OFERTA: TipoOferta[] = ["gratis", "dias", "descuento", "creditos", "estudiantes"];

/** Etiquetas cortas para chips y badges. Una sola fuente de verdad para que
 * el filtro y la tarjeta se llamen igual. */
export const ETIQUETA_TIPO: Record<TipoOferta, string> = {
  gratis: "Gratis",
  dias: "Días",
  descuento: "% dto.",
  creditos: "Créditos",
  estudiantes: "Estudiantes",
};

/** Una oferta ya validada, del catálogo base o de la fuente del usuario. */
export interface Oferta {
  id: string;
  proveedor: string;
  titulo: string;
  tipo: TipoOferta;
  /** lo que se lleva en grande en la tarjeta: «Gratis», «7 días de Pro»… */
  valor: string;
  descripcion: string;
  url: string;
  /** día local de fin «YYYY-MM-DD» o null si el programa es permanente */
  termina: string | null;
  /** día en que se verificó a mano el enlace y las condiciones */
  verificado: string;
}

/** Día de la última revisión a mano del catálogo base. Se muestra en el
 * diálogo: las condiciones cambian sin aviso y esto da el marco. */
export const OFERTAS_VERIFICADO = "2026-09-06";

/** El catálogo que viaja con la app: programas de larga vida, publicados por
 * cada proveedor, sin fechas de fin (termina: null). Nada de cifras que
 * nadie garantiza: donde la cuota exacta no está fijada por contrato, se
 * dice qué es y se manda al panel del proveedor. */
export const OFERTAS_BASE: Oferta[] = [
  {
    id: "of-google-aistudio",
    proveedor: "Google AI Studio",
    titulo: "Cuotas gratuitas de Gemini en AI Studio",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Uso de los modelos Gemini con cuotas diarias gratuitas y sin tarjeta. El panel marca cuánto queda del día; las claves se generan ahí mismo.",
    url: "https://aistudio.google.com",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-github-copilot-free",
    proveedor: "GitHub Copilot",
    titulo: "Plan Copilot Free",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Autocompletado y chat con cuota mensual gratuita en VS Code y la web. La cuota exacta la publica GitHub y la ha retocado más de una vez.",
    url: "https://github.com/features/copilot",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-mistral-lechat",
    proveedor: "Mistral Le Chat",
    titulo: "Le Chat gratuito",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Chat con los modelos de Mistral sin coste, con generación de imágenes y búsqueda. El plan de API también tiene nivel gratuito con cuota.",
    url: "https://chat.mistral.ai",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-openrouter-free",
    proveedor: "OpenRouter",
    titulo: "Modelos con sufijo :free",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Decenas de modelos abiertos con coste cero y límite diario, todos con la misma cuenta y la misma clave. Filtro «:free» en su catálogo.",
    url: "https://openrouter.ai/models?q=free",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-perplexity",
    proveedor: "Perplexity",
    titulo: "Plan gratuito de búsquedas",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Búsquedas con respuesta citada sin pagar. El plan Pro añade búsquedas avanzadas ilimitadas, pero el nivel gratuito sirve para probarlo.",
    url: "https://www.perplexity.ai",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-groq",
    proveedor: "Groq",
    titulo: "Nivel gratuito de API",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Clave gratuita con cuotas por minuto y por día para modelos abiertos a velocidad extrema. Las cuotas exactas se ven en su consola.",
    url: "https://console.groq.com",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-cerebras",
    proveedor: "Cerebras",
    titulo: "Nivel gratuito de API",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Clave gratuita con cuota diaria para modelos abiertos sobre su hardware propio. El límite del día lo publica su panel, no esta lista.",
    url: "https://cloud.cerebras.ai",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-mistral-api",
    proveedor: "Mistral La Plateforme",
    titulo: "Plan gratuito de API",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Nivel gratuito con cuota para experimentar con los modelos de Mistral vía API. Requiere verificar el teléfono al crear la cuenta.",
    url: "https://console.mistral.ai",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-cohere",
    proveedor: "Cohere",
    titulo: "Clave de prueba",
    tipo: "gratis",
    valor: "Prueba",
    descripcion:
      "Clave de prueba gratuita con cuota mensual limitada, suficiente para valorar sus modelos de chat y de embeddings antes de pagar.",
    url: "https://dashboard.cohere.com",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-huggingface",
    proveedor: "Hugging Face",
    titulo: "Créditos de inferencia incluidos",
    tipo: "creditos",
    valor: "Créditos",
    descripcion:
      "Las cuentas gratuitas reciben créditos para usar modelos vía sus proveedores de inferencia. Se renuevan cada mes mientras no pagues.",
    url: "https://huggingface.co/docs/inference-providers",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-together",
    proveedor: "Together AI",
    titulo: "Crédito de bienvenida",
    tipo: "creditos",
    valor: "Crédito",
    descripcion:
      "Crédito de bienvenida al crear la cuenta, para probar sus modelos abiertos de pago por uso sin poner dinero todavía.",
    url: "https://api.together.xyz",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-deepseek",
    proveedor: "DeepSeek",
    titulo: "App y web gratuitas",
    tipo: "gratis",
    valor: "Gratis",
    descripcion:
      "Chat sin coste en web y app. La API se paga, pero sus precios por token históricamente bajos la hacen popular para probar agentes.",
    url: "https://chat.deepseek.com",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-gemini-estudiantes",
    proveedor: "Google Gemini",
    titulo: "Gemini Pro para estudiantes",
    tipo: "estudiantes",
    valor: "Meses gratis",
    descripcion:
      "Meses del plan Pro sin coste para estudiantes verificables. La duración y los países cambian por curso académico: confirma en la fuente.",
    url: "https://gemini.google/students",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
  {
    id: "of-github-student",
    proveedor: "GitHub Education",
    titulo: "Copilot Pro gratis para estudiantes",
    tipo: "estudiantes",
    valor: "Gratis",
    descripcion:
      "El Student Developer Pack incluye Copilot Pro sin coste mientras dure la acreditación de estudiante o docente. Renovación por curso.",
    url: "https://education.github.com/pack",
    termina: null,
    verificado: OFERTAS_VERIFICADO,
  },
];

/* ——— fechas ——— */

/** Diferencia en días entre el fin de la oferta y hoy (negativa: ya pasó).
 * Mismo formato local «YYYY-MM-DD» que el Modo Repaso: sin zonas horarias. */
export function diasRestantes(termina: string, hoy: string): number {
  const p = (s: string) => s.split("-").map(Number);
  const [ay, am, ad] = p(termina);
  const [hy, hm, hd] = p(hoy);
  return Math.round(
    (new Date(ay, am - 1, ad).getTime() - new Date(hy, hm - 1, hd).getTime()) / 86_400_000
  );
}

/** El estado de una oferta HOY. El margen de aviso es inclusivo por ambos
 * extremos: faltar exactamente «diasAviso» días ya avisa, porque a la gente
 * le importa más enterarse un día antes que uno después. El día mismo del
 * fin aún avisa (hoy es el último día); al día siguiente caducó. */
export type EstadoOferta = "vigente" | "porExpirar" | "caducada";

export function estadoOferta(o: Oferta, hoy: string, diasAviso: number): EstadoOferta {
  if (!o.termina) return "vigente";
  const faltan = diasRestantes(o.termina, hoy);
  if (faltan < 0) return "caducada";
  if (faltan <= diasAviso) return "porExpirar";
  return "vigente";
}

/** Dif frente a la última comprobación: qué es nueva (no conocida) y qué
 * está por expirar (y no avisó ya). Las caducadas no se anuncian nunca como
 * nuevas: una promo que murió mientras no abrías la app no es una noticia,
 * es ruido. Los conjuntos vienen del store; aquí solo se calcula. */
export function novedadesOfertas(
  conocidas: ReadonlySet<string>,
  avisadas: ReadonlySet<string>,
  ofertas: readonly Oferta[],
  hoy: string,
  diasAviso: number
): { nuevas: Oferta[]; porExpirar: Oferta[] } {
  const nuevas: Oferta[] = [];
  const porExpirar: Oferta[] = [];
  for (const o of ofertas) {
    const estado = estadoOferta(o, hoy, diasAviso);
    if (estado === "caducada") continue;
    if (!conocidas.has(o.id)) nuevas.push(o);
    if (estado === "porExpirar" && !avisadas.has(o.id)) porExpirar.push(o);
  }
  return { nuevas, porExpirar };
}

/** Recuento para la cabecera del diálogo. */
export interface ResumenOfertas {
  vigentes: number;
  porExpirar: number;
  favoritas: number;
}

export function resumenOfertas(
  ofertas: readonly Oferta[],
  hoy: string,
  diasAviso: number,
  favoritas: ReadonlySet<string>
): ResumenOfertas {
  let vigentes = 0;
  let porExpirar = 0;
  let favs = 0;
  for (const o of ofertas) {
    const estado = estadoOferta(o, hoy, diasAviso);
    if (estado === "vigente") vigentes++;
    if (estado === "porExpirar") porExpirar++;
    if (favoritas.has(o.id)) favs++;
  }
  return { vigentes, porExpirar, favoritas: favs };
}

/* ——— filtros ——— */

export type FiltroTipo = TipoOferta | "todas" | "favoritas";

/** Minúsculas y sin tildes: «DÍAS» encuentra «días», como en los comandos. */
export function normalizarConsulta(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** El listado que se pinta: siempre sin caducadas (ya no interesan), y con
 * los filtros acumulables: tipo, favoritas y texto libre. El orden es el del
 * catálogo, que va de lo más general a lo más específico. */
export function filtrarOfertas(
  ofertas: readonly Oferta[],
  opts: { consulta: string; tipo: FiltroTipo; favoritas: ReadonlySet<string>; hoy: string; diasAviso: number }
): Oferta[] {
  const q = normalizarConsulta(opts.consulta);
  const aguja = (o: Oferta) => normalizarConsulta(`${o.proveedor} ${o.titulo} ${o.descripcion}`);
  const out: Oferta[] = [];
  for (const o of ofertas) {
    if (estadoOferta(o, opts.hoy, opts.diasAviso) === "caducada") continue;
    if (opts.tipo === "favoritas" && !opts.favoritas.has(o.id)) continue;
    if (opts.tipo !== "todas" && opts.tipo !== "favoritas" && o.tipo !== opts.tipo) continue;
    if (q && !aguja(o).includes(q)) continue;
    out.push(o);
  }
  return out;
}

/* ——— fuente propia del usuario ——— */

/** Techo de descripción: una fuente descontrolada no puede tumbar el diálogo. */
const MAX_DESCRIPCION = 500;

function esFecha(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function esUrlWeb(value: unknown): value is string {
  // Solo http(s): una fuente que manda «javascript:» no entra ni por error.
  return typeof value === "string" && /^https?:\/\/\S+/i.test(value);
}

function normalizarOferta(bruta: unknown): Oferta | null {
  if (typeof bruta !== "object" || bruta === null) return null;
  const o = bruta as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const proveedor = typeof o.proveedor === "string" ? o.proveedor.trim() : "";
  const titulo = typeof o.titulo === "string" ? o.titulo.trim() : "";
  const valor = typeof o.valor === "string" ? o.valor.trim() : "";
  const descripcion = typeof o.descripcion === "string" ? o.descripcion.trim() : "";
  const url = typeof o.url === "string" ? o.url.trim() : "";
  // Los cinco campos que se muestran son obligatorios: sin alguno, la tarjeta
  // saldría coja y mejor no sale. El tipo tampoco se adivina: si no es uno de
  // los cinco, fuera (mostrar uno inventado sería peor que saltarse la fila).
  if (!id || !proveedor || !titulo || !valor || !esUrlWeb(url)) return null;
  if (!TIPOS_OFERTA.includes(o.tipo as TipoOferta)) return null;
  const recortada = descripcion.length > MAX_DESCRIPCION ? descripcion.slice(0, MAX_DESCRIPCION).trimEnd() + "…" : descripcion;
  return {
    id,
    proveedor,
    titulo,
    tipo: o.tipo as TipoOferta,
    valor,
    descripcion: recortada,
    url,
    termina: esFecha(o.termina) ? o.termina : null,
    verificado: esFecha(o.verificado) ? o.verificado : OFERTAS_VERIFICADO,
  };
}

/** Valida el JSON crudo de una fuente propia. Tolera basura (null, números,
 * objetos sin forma) saltándola: una fuente con 20 ofertas y 2 rotas trae 18,
 * no un error. Deduplica por id — gana la primera — porque las fuentes a
 * veces repiten filas al regenerarse. */
export function validarOfertas(datos: unknown): Oferta[] {
  if (!Array.isArray(datos)) return [];
  const out: Oferta[] = [];
  const vistas = new Set<string>();
  for (const bruta of datos.slice(0, 100)) {
    const o = normalizarOferta(bruta);
    if (!o || vistas.has(o.id)) continue;
    vistas.add(o.id);
    out.push(o);
  }
  return out;
}

/** Fusiona catálogo base + fuente propia. La fuente PISA por id (así puedes
 * corregir o «ampliar» una entrada de la base desde tu feed) conservando la
 * posición de la base; las ids nuevas se añaden al final. */
export function fusionarOfertas(base: readonly Oferta[], fuente: readonly Oferta[]): Oferta[] {
  const porId = new Map(fuente.map((o) => [o.id, o]));
  const out: Oferta[] = base.map((o) => porId.get(o.id) ?? o);
  const idsBase = new Set(base.map((o) => o.id));
  for (const o of fuente) if (!idsBase.has(o.id)) out.push(o);
  return out;
}
