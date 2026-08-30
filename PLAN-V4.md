# Prism AI — Plan hacia la v4

Revisión del documento «Roadmap para una super-herramienta» (30 ago 2026) y
plan de trabajo a partir de él.

Mismo método que en `PLAN-EVOLUCION.md`: **cada afirmación comprobada contra el
código**, no contra el README. El documento es bueno y varias de sus lecturas
son correctas; unas cuantas no, y dos de esas cambian el orden de todo.

---

## 1. Lo que comprobé

| Afirmación del documento | Realidad | |
|---|---|---|
| Sin function calling nativo | **Cierto.** Cero apariciones de `tools`, `tool_calls` o `functionDeclarations` en `chat-client.ts` | ✅ |
| Todo en localStorage | **Cierto.** `createJSONStorage(() => localStorage)`, y los adjuntos son `dataUrl` base64 enteros | ✅ |
| `chat-app.tsx` de 2.035 líneas | **Cierto** en las líneas | ✅ |
| «52 suscripciones a usePrism» | Son **23** | ⚠️ |
| «642 tests unitarios» | Son **674** (el documento se escribió antes) | ⚠️ |
| 17 proveedores | **Cierto** | ✅ |
| **«Búsqueda solo por título»** | **Falso.** `sidebar.tsx:104` ya busca en el contenido de todos los mensajes | ❌ |
| **Fase A del roadmap: «Cuota real, v3.14, 1 semana»** | **Ya está hecha.** `quota.ts` parsea las cabeceras `x-ratelimit-*`, hay `quota-panel.tsx`, y `health.ts` tiene `recordProviderFailure/Success` con enfriamiento por proveedor | ❌ |
| «"Gratis" definido por heurística» | **A medias.** Además del `includes("free")` ya hay `CURATED_FREE` por proveedor, `FULL_FREE_TIER` y `TRIAL_FREE_TIER` — o sea, la lista curada que propone como arreglo ya existe | ⚠️ |
| «Share Target ya está en el manifest, falta el handler» | **Falso.** No está ni una cosa ni la otra | ❌ |
| 4 de los 8 modos nuevos que propone | **Ya son skills**: Tutor → «Tutor paciente», Translator → «Traductor universal», Doc writer → «Redactor profesional», Reviewer/Pair → «Mentor de código» | ❌ |

Las dos correcciones que más pesan: **la fase A ya está terminada** (llegó en el
lote 1) y **la búsqueda ya es de texto completo**. El plan del documento arranca
por algo hecho y justifica los embeddings con un problema que no existe.

---

## 2. El plan, por orden

### 1 · Sacar los adjuntos de localStorage

**Esto no es una mejora: es un fallo de pérdida de datos esperando.**

Los adjuntos se guardan como `dataUrl` base64 completos dentro del store, y el
store entero vive en localStorage, con un tope de unos 5 MB. Un solo PDF puede
ocupar 2-3 MB en base64. Pero lo grave no es que falle el adjunto: **cuando
`persist` de zustand no puede escribir, no se guarda nada** — ni las
conversaciones, ni las claves, ni los ajustes. Y falla en silencio.

Se arregla moviendo solo los binarios a IndexedDB (que no tiene ese techo) y
dejando en localStorage la ficha con su id. Ni una función nueva para el
usuario; lo que quita es un suelo que se hunde sin avisar.

**Va primero porque es lo único de esta lista que puede costarte trabajo ya
hecho.**

### 2 · Herramientas de verdad, con detección de capacidad

Es el hueco real que el documento identifica bien: el agente no llama
funciones, interpreta etiquetas XML del texto.

Pero el documento lo tasa en «2-3 días» y se deja lo importante: **Prism apunta
a modelos gratuitos, y muchos no admiten `tools`, o los admiten mal.** Encender
`tools` a secas rompe el agente justo en los modelos para los que existe la app.

Así que no es «añadir tools al body», es:

1. **Detectar** si el modelo las admite —`model-probe.ts` ya sabe interrogar a
   un modelo y clasificar la respuesta; se extiende, no se inventa.
2. **Traducir** el mismo catálogo de herramientas a los tres formatos, que no
   coinciden (OpenAI `function`, Anthropic `input_schema`, Gemini
   `functionDeclarations`).
3. **Conservar el camino XML** como respaldo para los que no las tienen, y que
   se note en la interfaz cuál está usando cada modelo.

Herramientas para empezar, todas sobre cosas que ya existen: leer y escribir
archivo del Sandbox, ejecutar el proyecto, consultar cuota. Nada de buscar en
la web, que aquí no se puede hacer sin servidor.

Realista: **una semana o dos**, no dos días.

### 3 · Cerrar el bucle Sandbox → agente

El documento lo llama «webhooks» y acierta en que es barato: las tres piezas ya
están. `sandbox.ts` tiene el puente de consola, `visual-qa.ts` mide, y
`sandbox-pilot.ts` sabe pulsar y escribir. Lo que falta es que el resultado
vuelva al `agent-loop` en vez de a la pantalla.

Hoy el agente escribe código y **te pregunta a ti si funciona**. Con esto lo
ejecuta, lee su propio error y lo corrige. Es el mayor salto de sensación de
producto por el menor trabajo de la lista, y solo es cableado.

### 4 · Compartir a Prism desde otras apps (Share Target)

No existe nada, ni en el manifest ni el handler. Es pequeño y encaja con la
promesa de la app: compartes un texto o una imagen desde el móvil y se abre
Prism con eso dentro. Un par de días.

### 5 · Partir `chat-app.tsx` — pero después, no antes

2.035 líneas son reales y estorban. Pero un refactor no cambia nada que se vea,
y hacerlo «para preparar el terreno» es de las formas más caras de no entregar
nada.

Lo pondría **durante** el punto 2, no antes: meter herramientas obliga a tocar
el bucle del agente, y ahí sí sale gratis separar lo que se toque.

---

## 3. Lo que no haría, y por qué

**Recordatorios con Service Worker.** El documento dice «SW timers hasta ~5 min
en background, persistente con `periodicSync`». Eso no aguanta: `periodicSync`
es solo de Chromium, exige la PWA instalada y depende de heurísticas de uso del
navegador; y un `setTimeout` en un service worker no sobrevive a que el sistema
lo duerma. Un «recuérdame en 2 horas» que falla la mitad de las veces es peor
que no tenerlo — **es el mismo error que el medidor de cuota al 82% inventado**:
prometer un dato que no se puede sostener.

**Embeddings y búsqueda semántica, ahora.** El documento la justifica diciendo
que la búsqueda es solo por título, y no lo es. Además son 3 MB de modelo que
se descargan en el móvil de quien abra la app. Cuando la búsqueda de texto se
quede corta de verdad, se retoma; hoy no es el cuello.

**Vite en el navegador.** `esbuild-wasm` ronda los 10 MB. En una PWA pensada
para el móvil, eso es mucho peaje para una función que usaría una minoría.

**Los 8 modos nuevos.** Cuatro ya son skills (Tutor, Translator, Doc writer,
Reviewer). Y doce modos son un menú que nadie lee: cada uno cuesta contexto y
obliga a elegir. Si alguno falta, que salga de medir los cuatro que hay con la
Arena, no de una lista.

**DSL de skills.** `skill-permissions.ts` ya analiza el riesgo antes de
instalar. Un lenguaje propio con validador son dos semanas para algo que hoy
resuelve un análisis de texto.

---

## 4. Resumen

| | Qué | Cuánto |
|---|---|---|
| 1 | Adjuntos a IndexedDB | ~1 semana |
| 2 | Herramientas con detección de capacidad | 1-2 semanas |
| 3 | Bucle Sandbox → agente | ~3 días |
| 4 | Share Target | ~2 días |
| 5 | Partir `chat-app.tsx` | dentro del 2 |

El 1 es un arreglo, no una función: va primero porque protege lo que ya tienes.
El 3 es el que más se nota por lo que cuesta. El 2 es el que de verdad cambia
lo que Prism puede hacer, y por eso es el que más cuidado necesita.

Y una cosa en la que el documento acierta de pleno, igual que el anterior: la
ventaja no está en tener más proveedores. Los diecisiete que hay ya sobran; lo
que falta es que el agente pueda **hacer** cosas con ellos en vez de describirlas.
