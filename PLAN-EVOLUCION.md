# Prism AI — qué de ese plan vale la pena

Análisis del documento «PRISM AI — PLAN DE EVOLUCIÓN» (30 ago 2026) y de la
propuesta de *Free Pool* + *Health/Quota Manager*.

Escrito leyendo el código, no el README. Donde digo «ya existe» hay un archivo
detrás, y lo cito.

---

## 1. Lo primero: un tercio del plan ya está hecho

El documento se basa en «las capacidades visibles del repositorio y su README».
Eso se nota: propone como nuevo lo que ya está construido y probado. No es un
detalle menor, porque cambia qué merece la pena hacer ahora.

| El plan propone | En Prism ya está | Dónde |
|---|---|---|
| §13 Arena Judge, «combinar lo mejor» | Modo consenso: varios modelos en paralelo + síntesis, con las respuestas anonimizadas para que el sintetizador no se deje llevar por la marca | `consensus.ts` |
| §14 Model Intelligence (elegir por capacidad) | Router por tipo de tarea + memoria del último modelo que funcionó (LKGP) | `task-router.ts`, `health.ts` |
| §16 Observatory (latencia, P95, errores) | Panel de Uso con peticiones, latencia media, P95 y ahorro de contexto por modelo | `usage.ts`, `usage-panel.tsx` |
| §17 Credential Vault | Bóveda AES-GCM + PBKDF2 con PIN, y las claves nunca salen del dispositivo | `vault.ts`, `crypto.ts` |
| §22 Safety Gate (antes de push) | Revisión que **bloquea** la subida si detecta una credencial, con test E2E que lo demuestra | `sandbox-review.ts` |
| §24 Knowledge Graph (relación entre archivos) | Grafo del proyecto con dependencias y puntos de entrada | `project-map.ts`, `project-graph.tsx` |
| §2 Supervisor (versión reducida) | Agente Plan → Ejecutar → Revisar con límite de iteraciones | `agent-loop.ts` |
| §15 Modos económico/calidad | Compresión de contexto y ventana configurable | `compress.ts`, `recap.ts` |

También existen y el plan no los menciona: verificación de modelos antes de
añadirlos (`model-probe.ts`), radar de modelos gratis (`free-radar.ts`),
escudo de datos personales (`pii.ts`), registro de peticiones con cURL
redactado (`request-log.ts`), y traspaso cifrado entre dispositivos con QR
(`transfer.ts`, `qr.ts`).

**Conclusión:** la parte de «orquestar mejor lo que ya hay» está más avanzada
de lo que el plan supone. Lo que falta no es un Observatory ni un Arena Judge:
es otra cosa, y está más abajo.

---

## 2. La restricción que decide casi todo

Prism corre **en el navegador, sin servidor**. Eso no es un detalle de
implementación: es la promesa del producto («sin cuentas, tus claves solo en tu
dispositivo»). Y descarta o recorta varias propuestas del plan.

- **No hay proceso de fondo.** Nada se ejecuta con la pestaña cerrada. Cualquier
  cosa que suponga vigilancia continua, colas o reintentos en diferido no cabe.
- **No se puede automatizar un navegador ajeno.** El §8 Browser Agent, tal y
  como está descrito (abrir una web, hacer clic, leer la consola), no es
  posible desde una pestaña. **Sí** lo es dentro del propio Sandbox, que es un
  iframe que Prism controla. Es una versión más pequeña, pero real.
- **No hay dónde guardar estado compartido.** Memoria, tareas y eventos viven en
  el dispositivo. Sirve para un usuario; no para «el equipo se entera».

Y una segunda restricción, más incómoda: **Prism apunta a modelos gratuitos**,
que son justo los peores en cadenas largas de herramientas. Un supervisor
multiagente de diez pasos falla más cuanto más barato es el modelo. El plan
pone eso primero; yo lo pondría al final, y solo cuando el resto esté sólido.

---

## 3. El Free Pool y el medidor de cuota

Esta es la mejor idea del lote, y también la que hay que rediseñar antes de
construirla.

### Lo que falla en la propuesta tal cual

El panel del ejemplo muestra:

```
OpenRouter     🟢  82%
Google         🟢  64%
Groq           🟡  18%
```

**Esos porcentajes no se pueden saber para todos los proveedores.** Y un número
inventado en una pantalla es peor que no tener pantalla: te acostumbras a
confiar en él. Lo comprobé antes de escribir esto:

- **Groq** manda cabeceras `x-ratelimit-limit-*` y `x-ratelimit-remaining-*`
  **en cada respuesta**, con su hora de reinicio. Aquí el medidor es real.
- **OpenRouter** no las manda en las respuestas normales: solo cuando ya has
  chocado con el límite. Para saberlo antes hay que preguntar a
  `GET /api/v1/key`, que devuelve uso y tope de la clave.
- **Google Gemini** no publica cuota restante. Te enteras con un `429`.
- Cerebras, NVIDIA y Mistral: hay que comprobarlo uno a uno, no doy por hecho.

O sea: para un proveedor tendrías una barra exacta, para otro una consultada
aparte, y para varios **ningún dato**.

### Cómo lo haría

**Tres estados, y decir la verdad en cada uno.**

1. **Medido** — el proveedor manda las cabeceras. Barra real, con la hora a la
   que se repone.
2. **Consultado** — hay un endpoint (OpenRouter). Se pregunta al abrir el panel,
   no en bucle.
3. **Sin dato** — no se inventa un porcentaje. Se muestra lo que sí sabemos, que
   es bastante: **cuándo fue el último 429, cuántos fallos seguidos lleva y si
   está enfriándose ahora mismo**. Eso ya lo mide `health.ts` y funciona con
   *cualquier* proveedor, porque no depende de que él colabore.

Ese tercer estado es la clave: convierte el medidor de «bonito donde se puede»
a «útil siempre».

**Y el paso que de verdad cambia el uso diario:** `health.ts` hoy enfría **por
modelo**. Los límites de las cuotas gratuitas son **por proveedor**. Si Groq te
corta, te corta con todos sus modelos, y Prism los prueba uno por uno
gastándose los reintentos. Subir el enfriamiento a nivel de proveedor cuando el
`429` es de cuota es un cambio pequeño con efecto inmediato: el failover deja de
dar tumbos dentro del proveedor agotado y salta al siguiente.

Eso es el «Free Pool» de verdad. El resto —agrupar los modelos gratis por
proveedor en una lista— ya lo tienes en `free-models.ts` y el Radar.

**Veredicto: hacerlo. Es lo primero que haría de todo el documento.**
Coste bajo, se apoya en lo que ya existe, y se nota desde el primer día.

---

## 4. Lo que vale la pena, por orden

Ordenado por (lo que se nota) ÷ (lo que cuesta), no por ambición.

### 1. Cuota y enfriamiento por proveedor
Lo de arriba. Cabeceras reales donde las hay, honestidad donde no, y el
enfriamiento de cuota subido a nivel de proveedor.

### 2. Visual QA sobre la vista previa
El plan lo pone en la fase 2. Yo lo pondría el segundo, por un motivo concreto:
**el código para medirlo ya está escrito**, en los tests E2E de Prism. Ahí se
detecta desbordamiento horizontal, elementos fuera del viewport y ancho mínimo
del campo de escribir, midiendo el DOM real a 320, 390, 768 y 1440 px.

Ese mismo método aplicado al iframe de la vista previa da, gratis:

- se sale por la derecha en móvil
- botón fuera de la pantalla
- texto por debajo de 12 px
- contraste insuficiente

Y encaja con lo que de verdad haces con Prism: pedirle páginas y mirarlas. Que
te avise «esto se rompe a 320 px» antes de que lo descargues vale más que
cualquier agente.

### 3. Memoria de fallos
De todo el plan, es la idea más original y la que no tiene ningún competidor
directo. Y es barata: una lista de `{ intento, resultado, regla }` que el agente
consulta antes de actuar.

Con una condición para que no se convierta en basura: **que las entradas
caduquen o se puedan borrar de una en una**. Una memoria de errores que crece
sin límite acaba envenenando el contexto con reglas que ya no aplican.

Empezaría solo con los errores del Sandbox y del agente, que son verificables
—falló el test, se rompió el build—, no con «el modelo dijo algo raro».

### 4. Ficha del proyecto (Project Passport)
`project-map.ts` ya detecta tecnologías, dependencias y puntos de entrada. Falta
presentarlo como una ficha y **que el agente la lea antes de trabajar**. Es sobre
todo trabajo de presentación sobre datos que ya se calculan.

### 5. Permisos de las Skills
El único punto del plan que es de seguridad de verdad. Hoy una Skill instalada
puede hacer lo que el resto de la app puede hacer, y la app llega a tus repos.
Declarar permisos y enseñarlos antes de instalar es correcto y no es caro.

Con un matiz importante: **un permiso solo vale si algo lo hace cumplir**. Si es
una etiqueta informativa y el código no la comprueba, es peor que nada, porque
tranquiliza sin proteger.

### 6. Regresión visible tras un cambio
La versión útil y alcanzable del §7: tras modificar en el Sandbox, volver a
ejecutar lo que ya se ejecutaba antes y **comparar**. No «Regression AI»: un
antes y un después medidos, y qué dejó de funcionar.

### 7. Agente de navegador, dentro del Sandbox
Acotado a lo que Prism controla: abrir la vista previa, cambiar el viewport,
pulsar, escribir, leer la consola y las excepciones. Nada de webs ajenas.
Es la mitad del §8, pero es la mitad que se puede construir de verdad.

---

## 5. Lo que no haría, y por qué

**§2 Supervisor y §3 Auto Team, ahora.** Es lo primero del plan y sería lo
último de mi lista. Un supervisor que reparte trabajo entre seis modelos falla
en cadena: cada paso multiplica la probabilidad de que algo salga mal, y los
modelos gratuitos —los que Prism usa— son los que peor aguantan cadenas largas.
El modo consenso ya te da la ventaja principal (varias opiniones, una síntesis)
sin ese riesgo. Volvería a esto cuando la memoria de fallos y la regresión
estén funcionando, porque son justo lo que hace falta para que un supervisor no
se despeñe.

**§15 Token Budget («34K tokens, 4 iteraciones, 2m 18s»).** Mismo problema que
el medidor de cuota inventado: esos números no se pueden calcular antes de
ejecutar. Un presupuesto que falla el 50% de las veces enseña a ignorarlo. Lo
que sí sirve —y ya está— es medir el gasto **después**, que es lo que hace el
panel de Uso.

**§19 Workspaces.** Reescribir toda la navegación es de las cosas con peor
relación entre riesgo y beneficio. Prism cabe hoy en una barra lateral. Cuando
no quepa, se rehace; hacerlo antes es trabajo a cuenta de un problema que aún no
tienes.

**§20 Event Bus y §21 Task State Machine.** No son malas ideas, son
**infraestructura sin efecto visible**. El plan las pone en la fase 1, o sea:
semanas de trabajo antes de que nada cambie en la pantalla. Tienen sentido
cuando haya varias funciones peleándose por coordinarse. Hoy no las hay.

**§12 Git Time Machine.** Es git. Comparar dos versiones y volver atrás ya lo
hace, mejor y sin riesgo de que Prism se equivoque.

**§17 Credential Vault como rearquitectura.** Ya está hecho (`vault.ts`). Lo que
propone el plan por encima de eso es redibujar un diagrama.

**§24 Knowledge Graph 2.0.** El salto de «relaciones entre archivos» a
«relaciones semánticas» suena bien y en la práctica significa pedirle a un
modelo que invente relaciones que luego nadie verifica. El grafo actual es
correcto porque se calcula del código.

---

## 6. Por dónde empezar

Tres cosas, en este orden, y ninguna es grande:

1. **Cuota real por proveedor** — cabeceras donde las hay, `429` medidos donde
   no, y enfriamiento por proveedor cuando el corte es de cuota.
2. **Visual QA en la vista previa** — reutilizando el medidor que ya está en los
   tests.
3. **Memoria de fallos**, empezando por los errores verificables del Sandbox.

Las tres se apoyan en código que ya existe, las tres se notan el mismo día, y
ninguna obliga a tocar la arquitectura.

---

## 7. Dónde el plan acierta de pleno

En su conclusión: **la ventaja no será tener cien modelos, sino orquestar bien
los que ya hay**. Eso es exactamente correcto, y es la razón por la que la parte
del Free Pool merece la pena y la del supervisor puede esperar.

Solo le añadiría una línea: orquestar bien empieza por **no mentir sobre lo que
se sabe**. Un medidor que dice «sin dato» cuando no lo tiene vale más que uno
que enseña un 82% inventado, porque el primero se puede usar para decidir.

---

## Fuentes consultadas

Las afirmaciones sobre cabeceras y cuotas están comprobadas, no recordadas:

- [Rate Limits — GroqDocs](https://console.groq.com/docs/rate-limits)
- [API Credit & Rate Limits — OpenRouter](https://openrouter.ai/docs/api_reference/limits)
- [OpenRouter Rate Limits: What You Need to Know](https://openrouter.zendesk.com/hc/en-us/articles/39501163636379-OpenRouter-Rate-Limits-What-You-Need-to-Know)

Las cuotas concretas de cada proveedor cambian a menudo y varían entre fuentes,
así que en el diseño **no se codifican números**: se preguntan al proveedor o se
miden. Cerebras, NVIDIA y Mistral están sin verificar; habría que mirarlos uno a
uno antes de prometer un medidor para ellos.
