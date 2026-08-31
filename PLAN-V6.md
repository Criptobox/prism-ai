# Prism AI — Plan V6

Análisis de seis ideas traídas de otro proyecto (free-claude-code) y plan de
trabajo a partir de ellas.

Mismo método que `PLAN-EVOLUCION.md`, `PLAN-V4.md` y `PLAN-V5.md`: **cada
afirmación comprobada contra el código**, no contra el README. Las ideas son
buenas en general y dos de ellas las haría ya. Otras dos **ya están hechas** —y
una de ellas mejor de lo que propone el original—, y la más ambiciosa choca de
frente con la promesa del producto, aunque tiene una versión que sí encaja.

---

## 1. Lo que comprobé

| Afirmación | Realidad | |
|---|---|---|
| «Tienes Auto Router pero no circuit breaker» | **Falso.** `health.ts` se llama a sí mismo «circuit breaker ligero» en su cabecera y hace: cooldown por modelo, **backoff exponencial con tope**, cooldown por PROVEEDOR para cuotas, y LKGP | ❌ |
| «Añadir un provider son 800 líneas» | **Falso.** 15 de los 17 hablan protocolo OpenAI: añadir uno es **una entrada de 14 líneas** en una tabla | ❌ |
| «Cada provider tiene su rama con duplicación» | **A medias.** Hay 15 ramas `protocol ===` en 3 archivos, pero solo Anthropic (1) y Gemini (1) tienen camino propio | ⚠️ |
| «No tienes normalización entre proveedores» | **Falso.** `tools-translate.ts` normaliza las herramientas a los 3 formatos y `finish-reason.ts` (v3.24) normaliza el motivo de parada | ❌ |
| «Rotación automática cuando un free se queda sin cuota» | **Ya está**, y costó cuatro versiones (v3.17–v3.20): failover encadenado que además **continúa** el trabajo | ✅ |
| «Avisar cuando un modelo free deja de ser free» | **No existe.** `isFreeModel` es estático: nada vigila el cambio | ✅ hueco real |
| «Hoy tu setup es clonar, instalar, copiar .env, configurar keys» | **A medias.** `scripts/setup.mjs` ya hace las tres primeras en un comando | ⚠️ |
| «Panel donde ver latencias, fallos, tráfico» | **A medias.** Existen ya 936 líneas de paneles (Uso 381, Cuota 294, Arena 261) — pero **repartidos** | ⚠️ |
| «Reglas de fallback configurables» | **No existe.** `FAILOVER_ORDER` y `PROVIDER_FIT` son constantes en el código | ✅ hueco real |

La corrección que más pesa: **dos de las seis ideas ya están implementadas**, y
el circuit breaker que propone montar con `opossum` no solo existe, sino que
`opossum` es una librería de **Node** — no funciona en una PWA que corre en el
navegador. Habría sido una dependencia nueva para algo ya hecho, y encima
inservible aquí.

---

## 2. Las seis ideas, una a una

### 1 · Panel de control de proveedores → **sí, pero como unificación, no como obra nueva**

El diagnóstico acierta: Prism tiene los datos y no tiene **un sitio donde
verlos juntos**. Lo que ya existe, repartido:

- **Uso**: peticiones, media, p95, caracteres, y desde la v3.26 el acierto
  medido por modelo.
- **Cuota**: las tres honestidades (medida / consultada / sin dato).
- **Registro de peticiones**: las últimas 10, con «copiar como cURL».
- **Salud**: cooldowns por modelo y por proveedor, LKGP.
- **Chips de estado** en la cabecera: qué resolvió Auto y cómo va la cuota.

O sea que «qué modelo está sirviendo» y «latencias y fallos» **ya se pueden
saber**; lo que falta es no tener que abrir tres paneles para verlo.

**Lo que de verdad no existe y es lo valioso: las reglas de fallback
configurables.** Hoy `FAILOVER_ORDER` (orden de preferencia de proveedores) y
`PROVIDER_FIT` (afinidad por tipo de tarea) son **constantes en el código**. Si
quieres que Groq vaya antes que Gemini, hay que recompilar.

Eso sí convierte «tengo varios proveedores» en «tengo un sistema»: que el orden
sea tuyo, arrastrable, y que Auto lo respete.

**Coste: ~1 semana** (panel unificado 3 días + orden configurable 3 días).

### 2 · `ProviderAdapter` → **no como refactor grande; sí terminar lo empezado**

La idea es buena en abstracto y la tasación está mal en concreto. Los números:

- **15 de 17 proveedores hablan protocolo OpenAI.** Añadir uno son 14 líneas
  de tabla: id, nombre, protocolo, URL base, URL de la clave, modelos, color.
- Solo **Anthropic y Gemini** tienen camino propio, y es porque sus APIs son
  de verdad distintas: eventos SSE distintos, cuerpo distinto, endpoint distinto.
- La normalización **ya se está haciendo por piezas**: `tools-translate.ts`
  para las herramientas, `finish-reason.ts` para el motivo de parada,
  `buildRequest`/`endpoint` para el transporte.

Un `ProviderAdapter` con `normalizeRequest / normalizeStreamChunk /
normalizeToolCall` abstraería **dos casos especiales**. Eso no quita bugs: los
mueve de sitio y añade una capa.

**Lo que sí haría, y es lo que el diagnóstico roza sin nombrar: normalizar los
bloques de razonamiento.** Hoy `splitThinkTags` apaña `<think>` en el contenido
y el campo `reasoning_content` de OpenAI-compatibles, pero cada familia lo
manda a su manera y no hay un sitio único que lo traduzca — como sí lo hay ya
para tools y para `finish_reason`. Eso son **2-3 días** y sigue el patrón que ya
funciona: una pieza normalizada cada vez, no un adaptador de golpe.

### 3 · Circuit breaker con `opossum` → **descartado: ya existe, y la librería no vale aquí**

`health.ts`, cabecera literal: «circuit breaker ligero + LKGP». Hace:

1. Cooldown por modelo tras 429/5xx, respetando `Retry-After`.
2. **Backoff exponencial**: cada fallo consecutivo duplica el enfriamiento, con
   tope.
3. **Cooldown por proveedor** en cortes de cuota — porque las cuotas gratis son
   casi siempre por proveedor, y sin esto el failover daba tumbos entre modelos
   del proveedor ya agotado provocando más 429.
4. LKGP: el último que funcionó va primero.

El punto 3 no lo tiene un circuit breaker genérico: es específico de este
problema, y salió de un fallo real.

Y `opossum` es una librería de Node. Prism corre en el navegador: no se puede
usar, y meterla contradice además la regla de no añadir dependencias sin
necesidad.

### 4 · Avisar cuando un free deja de ser free → **sí, y es lo más barato de la lista**

Aquí el diagnóstico acierta de pleno y es el único hueco limpio.

La rotación automática **ya está** (v3.17–v3.20, cuatro versiones). Lo que no
existe es **detectar el cambio**: `isFreeModel` es una heurística estática
—`:free` en el id, listas curadas— que no vigila nada. Si mañana un modelo deja
de ser gratis, Prism lo sigue tratando como gratis hasta que te llega el 402.

Ya hay dónde apoyarse: el radar pregunta a tus proveedores (v3.31), y `useUsage`
guarda lo que has usado. Comparar la lista de hoy con la de ayer y avisar de lo
que **desapareció de la capa gratis** es pequeño y muy visible.

**Coste: 2-3 días.**

### 5 · API compatible con Anthropic Messages → **la más interesante y la más peligrosa**

El análisis estratégico es correcto: convierte Prism de «PWA de un solo cliente»
en algo con lo que hablan otros. Y es verdad que el router de modelos gratis
con failover es lo que Prism tiene y otros no.

**Pero choca de frente con la promesa del producto.** Para que otro cliente
hable con Prism, Prism tiene que **tener las claves donde las pueda usar sin
ti**: en el servidor. Hoy viven en tu navegador, y esa frase —«las claves solo
en tu dispositivo»— es la mitad de por qué existe la app.

Hay una versión que sí encaja, y solo una: **una pasarela LOCAL**. Si Prism
corre en tu máquina, «el servidor» eres tú, y las claves siguen sin salir de tu
dispositivo. Con dos condiciones que no se pueden negociar:

1. **Apagada por defecto en cualquier despliegue.** Igual que `/api/repos`, que
   ya está cerrada sin `PRISM_ACCESS_CODE`. Un despliegue público con esto
   abierto es una barra libre a tus claves.
2. **Decir en voz alta el precio.** Hoy las claves están en `localStorage` del
   navegador; la pasarela no puede leerlas desde ahí, así que necesitaría su
   propia fuente (variables de entorno o un archivo local). Son **dos sitios
   donde configurar lo mismo**, y eso hay que contarlo, no esconderlo.

Y el trabajo real no es pequeño: el protocolo Messages de Anthropic tiene
streaming por eventos (`content_block_start` / `_delta` / `_stop`), `tool_use`,
bloques de razonamiento. Traducir eso desde 17 proveedores **en ambos sentidos**
son **3-4 semanas**, no días.

**Mi recomendación: no ahora.** No porque sea mala —es la más ambiciosa y
puede que la más valiosa a largo plazo— sino porque es un producto distinto
con otro usuario, y hacerlo a medias deja las dos cosas peor. Si algún día se
hace, que sea decidido y con el punto 1 y el 4 ya cerrados.

### 6 · Instalador único → **medio hecho; lo que falta es pequeño**

`scripts/setup.mjs` ya existe y es multiplataforma: comprueba Node ≥ 20.9,
instala dependencias y crea `.env.local` desde el ejemplo. O sea que de los
cuatro pasos que menciona el análisis, **tres ya son un comando**.

Lo que falta de verdad es no tener que clonar: un `npx prism-ai` que levante la
app sin repositorio. Es real y reduce fricción, pero es **empaquetado y
publicación en npm**, no una función. Y hay un detalle que conviene mirar antes:
Prism trae `sharp` y `pdfjs-dist`, que no son pequeños en un `npx`.

**Coste: 2-3 días.** Valor: alto para quien llega nuevo, cero para quien ya lo
tiene instalado.

---

## 3. El plan, por orden

| | Qué | Cuánto | Por qué ahí |
|---|---|---|---|
| **1** | Avisar cuando un modelo deja de ser gratis (§4) | 2-3 días | Único hueco limpio de la lista. Barato y muy visible |
| **2** | Orden de fallback configurable (§1) | ~3 días | Lo que de verdad convierte «varios proveedores» en «un sistema». Hoy es una constante en el código |
| **3** | Panel unificado (§1) | ~3 días | Los datos ya están; falta no abrir tres paneles |
| **4** | Normalizar los bloques de razonamiento (§2) | 2-3 días | Termina el patrón de tools y `finish_reason`, sin refactor grande |
| **5** | `npx prism-ai` (§6) | 2-3 días | Fricción de entrada. Va después porque no mejora a quien ya está |

**Unas dos semanas.** Los dos primeros son la semana que se nota.

---

## 4. Lo que no haría, y por qué

- **`ProviderAdapter` como refactor grande** (§2). Abstraería dos casos
  especiales; 15 de 17 proveedores ya son una entrada de tabla.
- **`opossum`** (§3). El circuit breaker existe, es mejor para este problema, y
  la librería es de Node: aquí no corre.
- **La pasarela Anthropic** (§5), **por ahora**. Necesita las claves en el
  servidor. La versión local es viable y está descrita arriba, pero es un
  producto distinto y son semanas.
- **Plugin de VSCode/JetBrains.** Sale de la misma idea que §5 y arrastra el
  mismo problema, con el añadido de mantener una extensión.

---

## 5. Lo que no he podido comprobar

- **No he visto el código de free-claude-code.** El análisis está hecho sobre
  la descripción que me diste, así que puede que su implementación sea más fina
  de lo que suena. Lo que sí está comprobado es **el lado de Prism**: todo lo
  que digo que existe, existe, y he citado el archivo.
- **Las tasaciones son mías y no las he ejecutado.** Lo medido es el código
  actual: 15/17 proveedores en protocolo OpenAI, 936 líneas de paneles, las
  constantes de fallback.
- **Lo de `npx` no lo he probado.** Que Next.js 16 con `sharp` y `pdfjs-dist`
  arranque bien desde un paquete publicado es una suposición razonable, no un
  resultado.
