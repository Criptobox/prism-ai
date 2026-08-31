# Instrucciones para implementar el plan V6

Esto es lo que hay que hacer y cómo hacerlo sin repetir ninguno de los fallos
que ya nos han costado tiempo aquí.

Va junto con `INSTRUCCIONES-IA.md`, que sigue vigente entero. Este archivo
**añade** las trampas nuevas que aparecieron entre la v3.17 y la v3.31, y
reduce el plan a las cinco tareas que quedan. El análisis de por qué son estas
cinco y no otras está en `PLAN-V6.md`; aquí no se repite.

Léelo entero antes de escribir código.

---

## 0. Antes de nada

```bash
git clone https://github.com/Criptobox/prism-ai.git
cd prism-ai
npm ci
npm run dev
```

Las tareas de la sección 3 están **en orden**. Haz la 1 antes que la 2. No
mezcles dos tareas en un commit.

---

## 1. Reglas que no se pueden romper

Cada una viene de un fallo real. Al lado está el fallo.

### 1.1 Nunca `npm run build` con `npm run dev` levantado

Comparten `.next`. La build la reescribe por debajo, el servidor de desarrollo
sirve restos, la app sale **en blanco con 500** y **fallan todos los E2E** como
si tuvieras un bug.

> Nos pasó **dos veces en la misma tanda**, ya estando escrito en
> `INSTRUCCIONES-IA.md` §3.5. Las dos veces se perdió tiempo buscando un bug
> que no existía.

Si de pronto se cae media suite, comprueba esto **antes** de tocar nada:

```bash
pkill -f next && rm -rf .next && npm run dev
```

### 1.2 Vitest no tiene configurado el alias `@/`

Todo lo que viva en `src/lib/prism/` importa **en relativo** (`./types`,
`./free-models`). Si usas `@/lib/prism/...` el archivo **no se puede testear**:
el test ni siquiera lo importa.

> `use-agent-tools.ts` era el único archivo del directorio con `@/`. Por eso
> no tenía tests. Se cambió a relativo.

### 1.3 `npx tsc --noEmit` NO comprueba `tests/`

Solo `npm run build` los comprueba.

> Un test nuevo pasó el `tsc` limpio y la build encontró **cuatro** errores de
> tipos dentro de él.

### 1.4 Playwright: modo estricto

Tres formas de romperlo, las tres nos han pasado:

- **El texto de la respuesta se pinta dos veces** (línea de tiempo + panel de
  respuesta). Un `getByText(...)` sin `.first()` es una violación de modo
  estricto asegurada.
- **Los avisos flotantes se apilan**: dos avisos con un botón «Activar» cada
  uno. Acota siempre a `[data-sonner-toast]` y coge `.first()`.
- **Un `aria-label` nuevo puede romper un test viejo.** Al añadir
  `aria-label="Regenerar con otro modelo"`, `getByRole("button", {name:
  "Regenerar"})` pasó a encontrar dos botones y murió `chat.spec.ts`.

  > Regla: si tu etiqueta nueva contiene como subcadena el nombre de un botón
  > que ya existe, **renombra la tuya**, no la del botón que ya usa la gente y
  > al que ya apuntan otros tests. Antes de inventarte una etiqueta:
  > `grep -rn "getByRole(\"button\"" tests/e2e/ | grep -i <palabra>`

### 1.5 Un fixture que describe algo imposible tapa el bug

Había un fixture de test con `ok: true` y `errors: 1` a la vez —imposible en
la realidad—, y por eso ningún test detectó que `run_project` le decía al
modelo «no se pudo ejecutar el proyecto» justo cuando el proyecto **sí** se
había ejecutado, con errores. El modelo no veía sus propios errores.

**Antes de escribir un fixture, pregúntate si ese estado puede existir.**

### 1.6 Si el test y el código no coinciden, mira cuál de los dos tiene razón

Escribí un test que esperaba que el analizador detectara una frase que ese
patrón no detecta. **Arreglé el test, no el analizador**: cambiar el analizador
para que encajara con mi test es escribir la pregunta y la respuesta a la vez.

Solo se cambia el código si el comportamiento que espera el test es el que
quiere el producto. Si no, el equivocado eras tú.

### 1.7 El sandbox nuestro no es el navegador del usuario

El iframe de la vista previa lleva `allow-scripts` **sin**
`allow-same-origin`. Dentro, `localStorage` lanza `SecurityError`. Las páginas
generadas usan `localStorage` a todas horas.

Ese error es **nuestro entorno**, no un fallo del modelo. Hay una función que
lo separa: `esErrorDelEntorno` en `src/lib/prism/auto-revision.ts`. Si añades
detección de errores nuevos, pásalos por ahí antes de echarle la culpa al
modelo.

Igual con las fases: los registros de la carga y los de los clics **no pueden
compartir array** (`corteBarrido` en `sandbox-runner.ts`), o un error de clic
cuenta como error de carga y dispara la corrección equivocada.

### 1.8 Al simular streaming, no cierres en el mismo tick

Un mock que llama a `controller.error()` en el mismo tick que el `enqueue`
hace que el cliente no llegue a leer el trozo: no hay trabajo parcial que
rescatar y el test prueba otra cosa distinta de la que crees. Deja **~150 ms**
entre el trozo y el corte.

### 1.9 `opossum` y cualquier librería de Node: no

Prism corre en el navegador. Antes de añadir una dependencia, comprueba que
funciona en el navegador. Y mira si ya está hecho: el circuit breaker existe
desde hace versiones en `src/lib/prism/health.ts`.

### 1.10 Las de siempre, que siguen valiendo

- **Sin números inventados.** Si un dato no se puede saber, se dice «sin
  dato». Un porcentaje falso en pantalla es peor que un hueco.
- **La versión se sube con `npm run bump -- patch|minor|major`**, nunca a mano:
  vive en `package.json` **y** en `src/lib/prism/app-version.ts`.
- **`AGENTS.md` y `CLAUDE.md` los genera Next y están en `.gitignore`.** Si
  aparecen en tu `git status`, no los subas.
- **`worklog.md` y `README.md` se añaden, no se reemplazan.**
- **No añadas proveedores** (hay 17) ni dependencias de varios MB.
- **No toques la promesa del producto**: sin cuentas, sin servidor, las claves
  solo en el dispositivo. Cualquier idea que necesite guardar claves fuera
  está descartada de entrada.
- **Nada de código GPL** (Chatbox) ni de prompts propietarios filtrados. Ideas
  sí, texto no: este repo es público y MIT.
- **Comentarios en español**, explicando *por qué*, no qué hace la línea.

---

## 2. La puerta: esto se ejecuta ENTERO antes de entregar

En este orden. Si algo sale rojo, no se entrega.

```bash
npm run lint          # eslint
npm run knip          # archivos y dependencias huérfanos
npm run build         # compila Y comprueba tipos (incluidos los de tests/)
npm run test          # 953 unitarios hoy
npm run test:e2e      # 125 E2E en Chromium
```

Y las dos que no están en el CI:

```bash
# 1. El servidor de producción arranca de verdad, no solo compila
npm run build && npm start
curl localhost:3000/api/version

# 2. Compila como lo hace Vercel
rm -rf .next && VERCEL=1 npm run build
ls .next/next-server.js.nft.json   # tiene que existir
```

Los números 953 y 125 son los de hoy (verificados). Después de tu cambio tienen
que ser **mayores**, no iguales: si no subieron, no has añadido test.

**Cada tarea lleva su test, y el test tiene que ponerse rojo si quitas tu
cambio. Compruébalo de verdad y dilo en el commit.**

---

## 3. Las cinco tareas

### Tarea 1 · Avisar cuando un modelo deja de ser gratis

**Qué pasa hoy.** `isFreeModel` (`src/lib/prism/free-models.ts:29`) es una
heurística **estática**: `free` en el id, `FULL_FREE_TIER`, `TRIAL_FREE_TIER`,
`CURATED_FREE`. Nada vigila el cambio. Si mañana un modelo deja de ser gratis,
Prism lo sigue tratando como gratis hasta que llega el 402.

**Qué hacer.** Un módulo nuevo, `src/lib/prism/cambio-gratis.ts`, con la
decisión **pura** (sin red, sin store):

- una función que compare *la foto de antes* con *la de ahora* por proveedor y
  devuelva las tres listas: **dejó de ser gratis**, **es nuevo y gratis**, y
  **desapareció del catálogo** (que no es lo mismo que dejar de ser gratis, y
  no se puede decir que lo sea);
- el tipo de la foto guardada, con su fecha;
- un límite de cuántos avisos se enseñan, como `MAX_NOVEDADES` en el radar.

La red la pone el llamador, igual que en `radar-propio.ts`. Las listas ya se
piden con `fetchModels(providerId, cfg)` (`src/lib/prism/chat-client.ts`), y
`proveedoresConsultables` (`src/lib/prism/radar-propio.ts`) ya dice a quién se
puede preguntar. Reutiliza ambas, no las reescribas.

La foto anterior se guarda en el store persistido (`prism-ai-v1`). Mira
`partialize` en `src/lib/prism/store.ts:606` antes de añadir campos.

**Dónde se ve.** En `src/components/prism/free-radar.tsx`, junto a «Nuevo para
ti». El aviso de «dejó de ser gratis» va **arriba**: es la mala noticia.

**Cuidado con esto:**

- **La primera vez no hay foto anterior. Entonces no hay aviso**, no hay «0
  modelos dejaron de ser gratis» ni un aviso vacío. Se guarda la foto y ya.
- **Un proveedor que falló al responder no es un proveedor sin modelos gratis.**
  Si `fetchModels` lanza, ese proveedor **se salta**: no se compara y no se
  sobrescribe su foto. Si no, un corte de red se enseña como «te has quedado
  sin todo».
- Sin números inventados: no digas «desde hace 3 días» si lo que guardas es la
  fecha de la última foto. Di la fecha que tienes.

**Tests.** Unitarios del comparador (primera vez, proveedor caído, alta, baja,
desaparición) y **un E2E** que abra el radar con una foto anterior preparada e
intercepte las listas, y compruebe que el aviso sale con el nombre del modelo.

---

### Tarea 2 · Orden de fallback configurable

**Qué pasa hoy.** Son constantes en el código:

- `FAILOVER_ORDER` — `src/lib/prism/free-models.ts:53`, orden de preferencia de
  proveedores, lo usa `pickFailoverCandidate` (línea 93).
- `PROVIDER_FIT` — `src/lib/prism/task-router.ts:49`, afinidad por tipo de
  tarea, lo usa la puntuación en la línea 145.

Para que Groq vaya antes que Gemini hay que recompilar.

**Qué hacer.** Que el orden venga de fuera, sin romper a quien no lo toca:

1. `pickFailoverCandidate` acepta un **orden opcional**; si no se le pasa,
   usa `FAILOVER_ORDER` tal cual. Todos los tests actuales tienen que seguir
   verdes **sin tocarlos**: si tienes que editar un test existente, tu firma
   está mal.
2. El orden del usuario se guarda en el store persistido, y es una **lista de
   `ProviderId`**, no un objeto de pesos.
3. Ese orden se **sanea al leerlo**: se ignoran ids que ya no existen y se
   añaden al final los proveedores que falten. Un orden guardado hace seis
   versiones no puede dejar fuera a un proveedor.
4. En Ajustes, pestaña de proveedores, una lista para subir y bajar. Con
   flechas basta; el arrastrar no merece una dependencia nueva.
5. Un botón para volver al orden por defecto.

**No** metas también `PROVIDER_FIT` en la interfaz en esta tarea. Es otro
concepto (afinidad por tarea, no preferencia global) y mezclarlos en una
pantalla no se entiende. Si acaso, en otra tarea.

**Tests.** Unitarios de `pickFailoverCandidate` con orden pasado y sin él, y
del saneado (id desconocido, proveedor que falta, lista vacía). **Un E2E** que
mueva un proveedor en Ajustes, recargue la página y compruebe que sigue
movido — que es donde se ve si el guardado funciona.

---

### Tarea 3 · Panel unificado

**Qué pasa hoy.** Los datos existen y están repartidos en tres sitios:

- `src/components/prism/usage-panel.tsx` — peticiones, media, p95, acierto por
  modelo.
- `src/components/prism/quota-panel.tsx` — cuota, con las tres honestidades
  (medida / consultada / **sin dato**).
- `src/components/prism/model-arena.tsx` — comparativa.

Más el registro de peticiones y los chips de estado de la cabecera.

**Qué hacer.** Una vista con pestañas que reúna los tres paneles **sin
reescribirlos**: se montan los componentes que ya existen. Si tu diff borra
lógica de esos tres archivos, te has salido del encargo.

Lo único que se añade es la fila de cabecera: proveedor y modelo activos,
cuántos modelos en enfriamiento ahora mismo (lo sabe `health.ts`) y el último
fallo. Los cooldowns son el dato que hoy no se ve en ninguna parte y que
explica «por qué no está usando el modelo que elegí».

**Cuidado:** «sin dato» se mantiene tal cual. No rellenes un hueco con una
estimación porque en un panel quede feo un vacío.

**Tests.** **Un E2E** que abra el panel, pase por las tres pestañas y
compruebe un dato real en cada una. Ojo al modo estricto (§1.4): estos paneles
repiten nombres de modelo por pantalla.

---

### Tarea 4 · Normalizar los bloques de razonamiento

**Qué pasa hoy.** El razonamiento se apaña en dos sitios distintos:
`splitThinkTags` (`src/lib/prism/thinking.ts:25`) para las etiquetas `<think>`
dentro del contenido, y el campo `reasoning_content` leído a mano en
`src/lib/prism/chat-client.ts:555`. Cada familia de modelos lo manda a su
manera y **no hay un sitio único que lo traduzca**, como sí lo hay ya para las
herramientas (`tools-translate.ts`) y para el motivo de parada
(`finish-reason.ts`).

**Qué hacer.** Seguir ese mismo patrón, que es el que funciona: un módulo puro
`src/lib/prism/razonamiento.ts` que reciba el trozo ya parseado de cada
protocolo y devuelva `{ contenido, razonamiento }` normalizado. `chat-client.ts`
pasa a llamarlo en vez de leer campos a mano.

Casos a cubrir. Los dos primeros son **mover lo que ya hay**; los dos
últimos son **cobertura nueva** —hoy no se leen en ninguna parte, compruébalo
tú: `grep -n "thought\|thinking" src/lib/prism/chat-client.ts` no devuelve
nada—, así que llegan con sus propios tests:

- `reasoning_content` de los OpenAI-compatibles (ya existe, se mueve).
- `<think>` dentro del contenido (ya existe, se mueve).
- `thinking` de Anthropic (nuevo).
- las partes con `thought` de Gemini (nuevo).

**La parte de mover se juzga por lo que NO cambia.** Para OpenAI y `<think>`
el comportamiento visible tiene que ser idéntico: los tests actuales de
`thinking.ts` y de streaming tienen que pasar **sin editarlos**. Si tienes que
tocarlos, has cambiado el comportamiento y eso ya no es este refactor.

Lo de Anthropic y Gemini sí es visible, así que lleva **un E2E** que
intercepte una respuesta con bloques de razonamiento y compruebe que salen
separados del contenido, no mezclados dentro de la respuesta.

**No** conviertas esto en un `ProviderAdapter`. Se normaliza una pieza, la del
razonamiento, y ya. Está explicado en `PLAN-V6.md` §2.

**Tests.** Unitarios por protocolo, incluido el caso de la etiqueta `<think>`
partida entre dos trozos del stream, que es donde esto se rompe de verdad
(y ojo al §1.8: no cortes el stream en el mismo tick que el trozo).

---

### Tarea 5 · `npx prism-ai`

**Qué hay hoy.** `scripts/setup.mjs` ya comprueba Node ≥ 20.9, instala
dependencias y crea `.env.local` desde el ejemplo: tres de los cuatro pasos ya
son un comando. Lo que falta es **no tener que clonar**.

**Qué hacer.** Empaquetar y publicar para que `npx prism-ai` levante la app.

**Antes de escribir nada, comprueba el tamaño.** Prism trae `sharp` y
`pdfjs-dist`, que no son pequeños en un `npx`:

```bash
npm pack --dry-run
```

Si el paquete sale desproporcionado, **para y dilo** en vez de publicar algo
que tarda cinco minutos en arrancar. Esa es una respuesta válida a esta tarea.

Esta tarea va la última **a propósito**: no mejora nada a quien ya lo tiene
instalado. Si el tiempo se acaba antes, es la que se cae.

---

## 4. Qué contar al entregar

En el mensaje del commit o del PR:

1. Qué comandos de la sección 2 ejecutaste y qué salió. **Con números**
   (unitarios y E2E antes y después).
2. Qué quitaste para ver el test en rojo, y que lo viste rojo.
3. **Lo que NO pudiste comprobar.** Esto no resta, suma.

**No escribas que algo funciona si no lo has ejecutado.** Si un paso no lo
pudiste hacer, dilo con esas palabras.
