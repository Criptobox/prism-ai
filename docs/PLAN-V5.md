# Prism AI — Plan V5

> **Estado: terminado.** Las once tareas de la §8 están implementadas, más el
> modo ahorro que se pidió después. De la v3.19.0 a la v3.27.0. El detalle de
> cada una —qué se hizo, qué se comprobó en rojo y qué **no** se pudo
> comprobar— está en `worklog.md`.
>
> | | Tarea | Versión |
> |---|---|---|
> | 1 | Failover que continúa en vez de reiniciar | v3.20.0 |
> | 2 | Medidor del prompt + skills gemelas + **modo ahorro** | v3.19.0 |
> | 3 | Recomendar skills según la tarea | v3.21.0 |
> | 4 | Regenerar con otro modelo | v3.22.0 |
> | 5 | Analizador de skills: coste y reanálisis | v3.22.1 |
> | 6 | Decidir lo de `xlsx` | v3.23.0 |
> | 7 | Leer `finish_reason` | v3.24.0 |
> | 8 | Partir el bucle de generación | v3.24.1 |
> | 9 | `read_url` para el agente | v3.25.0 |
> | 10 | Auto que aprende del historial | v3.26.0 |
> | 11 | Catálogo de skills | v3.27.0 |
>
> Lo descartado sigue descartado: el navegador con pestañas (§4, imposible por
> `X-Frame-Options`), las pestañas de vista previa (§4a, las quitaste tú) y los
> plugins con código ejecutable (§9).

Tus cinco ideas, contrastadas **contra el código**, no contra el README.
Mismo método que `PLAN-EVOLUCION.md` y `PLAN-V4.md`.

El resumen corto: **dos de las cinco ya están hechas o casi**, una es barata y
muy buena, otra es buena pero no como la imaginas, y la quinta —el navegador—
**no se puede hacer**, y conviene que sepas exactamente por qué antes de que
alguien te venda que sí.

---

## 0. De dónde partimos (medido hoy)

| | |
|---|---|
| Versión | 3.18.0 |
| Skills integradas | 7 |
| Herramientas del agente | 5 (`read_file`, `write_file`, `list_files`, `run_project`, `get_quota`) |
| Proveedores | 17 |
| Tests | 786 unitarios · 29 archivos E2E |
| `chat-app.tsx` | 2.340 líneas |

---

## 1. «Analizador de skills» → **ya existe**

`src/lib/prism/skill-permissions.ts`, 162 líneas, y no es un adorno: es una
**puerta de instalación**. Antes de instalar una skill se analiza su texto y se
reporta qué manda hacer:

- dominios remotos que carga o contacta, separando los CDN conocidos de los que
  no lo son;
- si le pide al modelo que te saque claves o contraseñas;
- si manda datos a un servidor ajeno (webhook, beacon);
- nivel `ok` / `aviso` / `riesgo`, **con las frases concretas que lo dispararon**.

Y lo de riesgo no se instala sin que lo aceptes expresamente. Los permisos
quedan guardados en la skill y visibles para siempre.

**Lo que le falta**, y esto sí es trabajo real:

1. **Solo se analiza al instalar.** Si editas una skill después, o si una
   integrada cambia en una actualización, nadie vuelve a mirar. Reanalizar al
   guardar es media tarde.
2. **Analiza riesgo, no calidad.** No te dice si una skill es *buena*: si se
   contradice con otra que tienes activa, si se come 3.000 caracteres de
   contexto, si duplica lo que ya hace otra. Eso es lo que de verdad falta —
   ver más abajo.

> **Consejo.** No lo reescribas. Añádele el reanálisis al editar y un aviso de
> **coste**: cuántos caracteres mete cada skill activa en el prompt. Hoy puedes
> tener cinco activas comiéndose el contexto sin enterarte.

---

## 2. «Recomendar skills para lo que pido» → **la mitad ya está. Hazlo.**

Esta es la buena, y es barata porque **la pieza difícil ya existe**.

`src/lib/prism/task-router.ts` ya clasifica lo que escribes en seis tipos —
`web`, `code`, `write`, `reason`, `data`, `chat`— y ya se usa para elegir
modelo (`PROVIDER_FIT`). Nadie la usa para elegir **skills**.

Es literalmente la misma señal aplicada a otra cosa:

```
classifyTask("hazme una landing")  →  kind: "web"
                                       ├── modelo: ya lo hace
                                       └── skills: "Desarrollador web experto"
                                                   "Diseños que no se repiten"   ← esto falta
```

Y ya hay precedente de cómo se sugiere algo sin ser pesado: `agentSugerido` en
`chat-app.tsx` propone el modo agente **una sola vez, al empezar la sesión**.
Copia ese patrón.

**Cómo lo haría, en orden de menos a más:**

1. Cada skill declara para qué tipos de tarea sirve (`kinds: TaskKind[]`). Son
   siete skills: se rellena a mano en una tarde.
2. Al escribir, si hay una skill apagada que encaja con la tarea detectada, un
   chip discreto en el compositor: «Para páginas web va mejor con *Desarrollador
   web experto*. **Activar**». Un clic, no un diálogo.
3. Se propone **una vez por sesión y por skill**. Si lo ignoras, no vuelve.

**Coste: 2-3 días.** Es la mejor relación valor/trabajo de toda tu lista.

> **Aviso importante.** No la conviertas en «activo yo las skills por ti».
> Sugerir es útil; decidir por el usuario es lo que hace que la gente
> desconfíe de la app. Un clic tuyo de por medio, siempre.

---

## 3. «Una store de skills» → **sí, pero como catálogo, no como tienda**

Otra que está más avanzada de lo que crees. `skills-dialog.tsx` **ya instala
desde URL**: pegas un `raw.githubusercontent.com/…/skill.md`, se descarga, se
analiza con la puerta de permisos y se instala.

O sea que el mecanismo está. **Lo que falta es el índice**: hoy tienes que
conocer la URL de memoria.

**Cómo se hace sin traicionar la promesa del producto** (sin cuentas, sin
servidor, las claves solo en tu dispositivo):

- Un repo público `prism-skills` con un `index.json`: nombre, descripción,
  autor, tipos de tarea, URL del `.md`.
- Prism lo lee igual que ya lee `/api/free-radar`. Es un fichero estático, no
  un backend.
- Cada entrada se instala por el camino que ya existe → **la puerta de permisos
  sigue en medio**. Esto es lo que hace que un catálogo abierto no sea un
  agujero: nada se instala sin que veas qué pide.
- Las contribuciones son *pull requests*. Sin cuentas, sin pagos, sin
  moderación que mantener.

**Coste: ~1 semana** (índice + pestaña de catálogo + búsqueda + filtro por tipo
de tarea). Encaja con el punto 2: el catálogo puede sugerir skills que **aún no
tienes instaladas**.

> **Consejo fuerte: no la llames «store» ni le pongas plugins.** Una skill es
> texto que se inyecta en el prompt: se analiza y se lee entero. Un *plugin* es
> código ejecutable, y eso cambia el problema por completo — necesitarías un
> aislamiento que hoy no tienes. Skills sí. Código de terceros, no.

---

## 4. «Un navegador con pestañas dentro de Prism» → **no se puede. Y lo que sí se puede es otra cosa**

Aquí voy a ser claro porque es la idea en la que más tiempo se puede perder.

**Un navegador de verdad dentro de una PWA no es posible.** No es una cuestión
de esfuerzo: casi todas las webs grandes mandan una de estas dos cabeceras…

```
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
```

…y el navegador **se niega a pintarlas dentro de un iframe**. Lo impone el
navegador, no la web: no hay código que lo esquive. Google, YouTube, X, Amazon,
GitHub, tu banco: todas bloqueadas. Tendrías un «navegador» que solo abre las
páginas que a nadie le importan.

Las dos únicas salidas, y por qué no valen aquí:

| Salida | Por qué no |
|---|---|
| Proxy en el servidor que quite esas cabeceras y reescriba las URLs | Rompe «sin servidor». Y no es un fin de semana: hay que reescribir enlaces, CSS, JS, cookies y peticiones en vivo. Es un producto entero, y de los que acaban en abuso y factura de ancho de banda |
| Extensión de navegador | Deja de ser una PWA. Otro producto, otra tienda, otro ciclo de revisión |

**Ahora lo que sí puedes tener, que sospecho que es lo que quieres de verdad:**

### 4a. Pestañas de vista previa — *descartado por ti*

Era la alternativa evidente: varias páginas generadas abiertas a la vez, y el
Sandbox ya maneja proyectos multiarchivo. Queda aquí anotado por si vuelve,
pero **fuera del plan de trabajo**.

### 4b. Que el agente pueda LEER una URL (esto también, y es aún más barato)

Distinto de navegar. `/api/proxy` ya sabe pedir cualquier host público y ya
tiene escudo anti-SSRF (`net-guard.ts`: rechaza `localhost`, IPs privadas,
metadatos de la nube, y también en las redirecciones).

Una herramienta `read_url` en el catálogo del agente —hoy son 5— le deja leer
una página y usar su contenido. No es navegar: es traer texto. Y es justo lo
que `PLAN-V4` daba por imposible «sin servidor» cuando resulta que el servidor
ya está y ya está protegido.

**Coste: 2 días.** Con una condición: **que se vea qué URL ha pedido**, en el
registro de peticiones que ya existe.

---

## 5. «Si un modelo se detiene, que pase a otro y siga» → **casi hecho. Falta lo importante.**

Esto es lo que llevamos arreglando tres versiones seguidas:

| | |
|---|---|
| v3.17.0 | El failover encadena hasta 4 saltos (antes solo daba **uno**) · el agente cortado se retoma solo |
| v3.17.1 | Una respuesta vacía ya no cuenta como éxito: salta al siguiente modelo |
| v3.18.0 | El código cortado por longitud se completa y **se cose en la misma burbuja** |

**Pero queda el trozo que da nombre a tu idea, y es el que más se nota.**

Ahora mismo, en `attemptFailover`:

```ts
deleteMessage(sessionId, failedAssistantId);   // ← tira lo que llevaba escrito
setModelKey(makeModelKey(candidate.providerId, candidate.modelId));
relanzar(sessionId, depth + 1, continuaciones);
```

Cuando un modelo se para a mitad de una web, Prism **borra lo que llevaba** y
el modelo nuevo **empieza de cero**. Cambia de modelo, sí; *seguir con la
tarea*, no. Con modelos gratis lentos, eso son minutos tirados en cada salto —
y es exactamente lo que describías.

**El arreglo es pequeño porque las piezas ya están.** `continuar.ts`
(v3.18.0) ya sabe detectar dónde se cortó algo y pedirle a un modelo que
empalme justo ahí. Lo único que falta es **usarlo también al cambiar de
modelo**: en vez de borrar, pasarle lo escrito al modelo nuevo con el prompt de
continuación.

**Coste: 2-3 días**, y de todo el plan es lo que más se va a notar.

---

## 6. El orden que yo seguiría

| | Qué | Cuánto | Por qué ahí |
|---|---|---|---|
| **1** | Failover que **continúa** en vez de reiniciar (§5) | 2-3 días | Es tu queja original y sigue a medias. Las piezas ya están |
| **2** | Recomendar skills según la tarea (§2) | 2-3 días | `classifyTask` ya existe. Lo que más valor da por lo que cuesta |
| **3** | Coste de contexto + reanálisis en el analizador (§1) | ~2 días | Cierra lo que ya tienes; sin esto las skills se comen el prompt a ciegas |
| **4** | `read_url` para el agente (§4b) | 2 días | El proxy y el escudo ya están hechos |
| **5** | Catálogo de skills (§3) | ~1 semana | Va el último a propósito: sin el §2 nadie lo abre |

Unas **tres semanas y media**. Pero el orden definitivo, con lo que añado yo,
está en la §8.

---

## 7. Lo que añadiría yo (no estaba en tu lista)

Seis cosas. Cada una sale de algo que he **medido** en el código esta semana,
no de buenas prácticas genéricas. Las tres primeras son mejoras; las tres
últimas son deuda, y las señalo como tal.

### 7.1 · Medidor del prompt — y las dos skills gemelas 🔴

Esto es lo que más me ha sorprendido al medirlo. Cada mensaje que mandas lleva
delante un system prompt montado con ocho piezas (`composeSettings`). Nadie lo
mide, y nadie lo enseña. Los números reales:

| Pieza | Caracteres |
|---|---|
| Skill «Desarrollador web experto» | 1.797 |
| Skill «Diseños que no se repiten» | 1.797 |
| Modo agente | 1.731 |
| **Las dos skills, activas POR DEFECTO** | **3.594** |
| **Con el agente encendido** | **~5.400 en cada mensaje** |

Unos 5.400 caracteres —del orden de 1.400 tokens— viajan **antes de que
escribas nada**, en un producto cuya gracia son los modelos gratis, muchos con
8.000 tokens de contexto. Es el 18% del contexto gastado de salida, invisible.

Y hay un detalle peor: **las dos skills activas por defecto se solapan.**
«Desarrollador web experto» ya lleva dentro un bloque «VARIEDAD OBLIGATORIA»
que es justo lo que hace la otra entera. Son ~1.800 caracteres de instrucción
casi duplicada en todos los mensajes.

Esto **puede ser parte de aquello de «cuando activo el agente muchos modelos
dan errores»** que dejé sin confirmar. No lo afirmo —para eso hace falta el
texto del error—, pero encaja: system prompt gordo + modelo de contexto corto
= 400.

Qué haría: una barra de presupuesto en Ajustes con lo que ocupa cada pieza, un
aviso cuando pase de un umbral, y decidir si esas dos skills se fusionan o si
solo una va activa de fábrica.

**Coste: ~2 días.** Es la que mejor relación tiene de toda la lista, la tuya
incluida.

### 7.2 · «Regenerar» con OTRO modelo

`regenerate` bifurca y vuelve a lanzar **con el mismo modelo**. Pero cuando una
respuesta te sale mal, lo que quieres nueve de cada diez veces no es la misma
tirada otra vez: es *«esto mismo, pero con otro modelo»*. Hoy eso son cuatro
pasos por Ajustes.

Un desplegable en el botón de regenerar con los modelos que responden. El
sistema de ramas ya guarda la anterior, así que puedes comparar las dos.

**Coste: 1-2 días.**

### 7.3 · Leer `finish_reason`

Los tres protocolos mandan un campo que dice **por qué** paró el modelo
(`finish_reason` / `stop_reason`). Prism no lo lee en ningún sitio: lo
comprobé buscándolo en todo `src/`.

Todo lo que arreglamos en la v3.18.0 —detectar que el código se cortó— va por
la **forma del texto** (una cerca ``` sin pareja). Funciona, pero es un indicio;
`finish_reason: "length"` es el proveedor diciéndotelo con todas las letras.
Con él, la detección deja de ser heurística.

**Coste: ~2 días** (hay que mapear los tres protocolos).

### 7.4 · Partir el bucle de generación 🟡 *deuda*

`chat-app.tsx` va por **2.340 líneas**, y ha crecido: `PLAN-V4` ya lo pedía
cuando tenía 2.035.

No lo propongo por estética. Lo propongo porque **toda la lógica de failover,
continuación y troceado vive dentro de un `useCallback` y solo se puede probar
con E2E**. Esta semana, cada arreglo ha costado un ciclo de tres minutos de
Playwright para comprobar una decisión que es una función pura. Y el mismo
patrón ya se corrigió en `use-agent-tools.ts`, con buen resultado: el bucle
salió del hook y aparecieron cuatro fallos que los E2E no veían.

Sacar solo las **decisiones** (¿reintento?, ¿salto?, ¿continúo?) a un módulo
puro. La parte de React se queda donde está.

**Coste: 3-4 días.** No verás nada nuevo en pantalla; verás que lo siguiente
cuesta la mitad.

### 7.5 · Decidir lo de `xlsx` 🟡 *deuda*

`npm audit`: 1 vulnerabilidad alta, **sin arreglo disponible** (prototype
pollution + ReDoS en SheetJS). Lleva abierta desde hace semanas.

La buena noticia es que la superficie es pequeña: `xlsx` se carga **bajo
demanda**, solo al adjuntar un `.xlsx/.xls`, se parsea en tu navegador y no hay
servidor ni otros usuarios expuestos. CSV y TSV usan un parser propio sin
dependencias. O sea: el riesgo es abrir tú un Excel malicioso en tu propia
pestaña.

Tres salidas: aceptarlo y **anotarlo en el README** (hoy no está en ningún
lado), cambiar a la distribución oficial de SheetJS (que sí publica versiones
parcheadas, pero fuera de npm), o quitar `.xlsx` y quedarse con CSV/TSV.

**Mi consejo: la segunda.** Pero lo importante es que sea una decisión escrita
y no un aviso que se ignora cada vez que corre `npm audit`.

### 7.6 · Que «Auto» aprenda de TU historial

`useUsage` ya registra de cada respuesta: modelo, si fue bien, milisegundos y
caracteres. Es un historial real de qué te funciona a ti.

`buildTaskChain` no lo mira. Ordena por una tabla estática de afinidad y por
`lastGood`, el último que funcionó. O sea: Auto no aprende, solo recuerda el
último acierto.

Ordenar la cadena por lo medido —tasa de acierto y latencia de **tus** últimas
semanas— convierte Auto en algo personal. Y el dato ya está guardado; no hay
que recolectar nada nuevo.

**Coste: 2-3 días.** Con una condición innegociable: **si no hay muestras
suficientes de un modelo, no se inventa un número.** Se dice «sin dato» y se
cae a la tabla estática, como con las cuotas.

---

## 8. El orden completo, con lo mío dentro

| | Qué | Cuánto |
|---|---|---|
| 1 | Failover que **continúa** en vez de reiniciar (§5) | 2-3 días |
| 2 | Medidor del prompt + las dos skills gemelas (§7.1) | ~2 días |
| 3 | Recomendar skills según la tarea (§2) | 2-3 días |
| 4 | Regenerar con otro modelo (§7.2) | 1-2 días |
| 5 | Coste de contexto y reanálisis en el analizador (§1) | ~2 días |
| 6 | Decidir lo de `xlsx` (§7.5) | 1 día |
| 7 | Leer `finish_reason` (§7.3) | ~2 días |
| 8 | Partir el bucle de generación (§7.4) | 3-4 días |
| 9 | `read_url` para el agente (§4b) | 2 días |
| 10 | Auto que aprende de tu historial (§7.6) | 2-3 días |
| 11 | Catálogo de skills (§3) | ~1 semana |

**Las cuatro primeras son una semana y media** y son las que cambian el uso
diario. Del 6 al 8 es la semana de pagar deuda; conviene meterla antes del 9,
porque `read_url` toca el mismo bucle que el 8 deja limpio.

---

## 9. Lo que NO haría

- **Un navegador de verdad.** Por lo de §4. Si alguien te dice que es fácil, no
  ha probado a meter `google.com` en un iframe.
- **Plugins con código ejecutable.** Skills sí, código de terceros no: no hay
  aislamiento que lo sostenga y la puerta de permisos deja de servir cuando lo
  que instalas no es texto.
- **Activar skills automáticamente.** Sugerir sí. Decidir por el usuario, no.
- **Más proveedores.** Siguen sobrando con 17.
- **Nada que necesite cuenta o guardar claves fuera del dispositivo.**

---

## 10. Lo que no he podido comprobar

- **Las tasaciones son mías y no las he ejecutado.** Los días son estimaciones;
  lo comprobado es lo que existe y lo que no.
- **Lo del iframe no lo he probado en este entorno** (no hay red abierta a
  webs). `X-Frame-Options` y `frame-ancestors` son estándar y su efecto está
  documentado, pero no lo he reproducido aquí.
- **No sé cuántas skills de terceros hay ahí fuera.** El catálogo (§3) solo
  vale la pena si alguien las escribe; si nadie lo hace, es una pestaña vacía.
  Por eso va el último.
- **Lo del prompt de 5.400 caracteres está medido; su efecto NO.** He contado
  los caracteres de cada pieza, eso es un hecho. Que sea la causa de los
  errores con el agente es una hipótesis que encaja, y sigue necesitando el
  texto del error para confirmarse.
- **Las seis propuestas de la §7 son mi criterio**, no un encargo tuyo. Si
  alguna te sobra, quítala: el orden de la §8 aguanta sin ella.
