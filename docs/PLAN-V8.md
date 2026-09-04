# Plan V8 — destilado de cuatro análisis

Base: `main` v3.42.0. Este documento resume cuatro análisis externos
(PLAN-V8, prismaianalisis, prismaianalisismejoras, PLAN-EVOLUCION),
**contrastados contra el código**, y dice qué entra, qué no y por qué.

## Primero: qué decían mal

Los cuatro traen datos que ya no son ciertos. Se anotan para que nadie
vuelva a decidir sobre ellos:

| Afirmación | Realidad (v3.42.0) |
|---|---|
| «1 076 / 890 / 1 178 tests unitarios» | **1 331**, 99 archivos |
| «119 / 131 E2E» | **164**, 62 specs |
| «12 herramientas del agente» | **15** |
| «knip no corre en CI por un OOM del parser» | Corre. `ci.yml`, paso «Restos sin usar (knip)» |
| «falta el trace panel del agente» | Existe: `agent-trace.tsx` (plan, pasos, herramientas) |
| «falta un sistema de permisos por herramienta» | Existe desde v3.41.0: `tool-permissions.ts`, con cumplimiento en el runner |
| «`chat-app.tsx` ~2 906 líneas» | **2 920**. Sigue creciendo |
| «Share Target solo procesa texto» | Sin verificar aún; el manifest sí declara `images` |

## Lo que sí acertaban, y entra

1. **El proxy no tenía límite de abuso.** Coincidían dos análisis y era
   cierto: cero coincidencias de `429`/`Retry-After` en la ruta. El escudo
   anti-SSRF impide llegar a la red interna; no impide que te usen de relé.
   → **Hecho en v3.43.0** (`proxy-budget.ts`).
2. **Faltaban tests de propiedad.** Los tres fallos que el usuario reportó
   esta semana —el QA que nunca llegaba al agente, el ZIP con carpeta que no
   resolvía, el escudo PII que rompía los adjuntos— pasaron por delante de
   tests de ejemplo verdes. Ninguno preguntaba la regla, solo un caso.
   → **Hecho en v3.43.0** (`tests/unit/propiedades/`, fast-check).
3. **Sin análisis estático del lado servidor.** → **Hecho** (`codeql.yml`).
4. **Ruido de planificación en la raíz.** → **Hecho**: todo a `docs/`.

## Lo que entra después, por orden

1. **Partir `chat-app.tsx`.** 2 920 líneas y creciendo; cada feature nueva
   lo toca. Extraer `use-generation`, `use-chat-attachments`,
   `use-system-prompt`. Regla: cada commit compila, tests verdes, y el
   archivo solo pierde líneas.
2. **Memoria negativa** (del PLAN-EVOLUCION, §3). La idea más valiosa de los
   cuatro documentos y la más barata de las suyas: reglas «no toques
   `Header.tsx`», «no cambies la arquitectura», que el `tool-runner` hace
   cumplir igual que ya hace con los permisos. Encaja con lo que existe
   (`project-map` notes + `tool-permissions`) sin inventar nada.
3. **Demo sin clave.** `preview-demo.ts` y `mock-llm` ya existen; falta el
   primer arranque que lo enseñe.
4. **i18n EN/ES.** Antes de v4.0, por tandas de 3-4 componentes.
5. **Más propiedades**: `compress.ts`, `health.ts`, `branches.ts`,
   `sandbox-modules.ts`, `vault.ts`.

## Lo que NO se hace, y por qué

- **Multi-Agent Orchestrator, Task DNA, Prism Lab, Prism OS**
  (PLAN-EVOLUCION §5, §4, §6, §20). Es otra aplicación, no una evolución.
  Y el argumento en contra está en el propio análisis que lo propone: los
  modelos gratis fallan en cadenas largas. Un orquestador de cinco agentes
  empeora el problema **para los modelos por los que esta app existe**.
- **Sincronización multi-dispositivo con backend.** El análisis que la pide
  la llama «la única limitación que no se resuelve con otra iteración». Pero
  «sin cuentas, sin servidor» no es una limitación: es el producto. Y ya hay
  `transfer.ts`, que pasa las claves cifradas de un dispositivo a otro sin
  servidor.
- **Búsqueda semántica local con embeddings.** Un modelo `bge-small` en
  WebWorker son decenas de MB descargados. `ask_memory` busca por palabras y
  lo dice; eso es honesto y cabe en la promesa.
- **Free Pool con porcentajes por proveedor.** Ya descartado en
  `PLAN-EVOLUCION.md` con el argumento correcto: las cuotas reales no se
  pueden saber y un número inventado es peor que ninguno.
- **Telemetría on-by-default.** Rompe la promesa.
- **Emulador de dispositivo en el Sandbox.** `visual-qa.ts` ya mide scroll,
  contraste y texto pequeño a 320 y 390 px, que es lo que importa.

## El método

Cada afirmación de este plan tiene un archivo detrás o se marca como no
verificada. Donde el repositorio ya había argumentado que algo NO se hacía,
se respeta. Donde un análisis propone algo que ya existe, se dice.
