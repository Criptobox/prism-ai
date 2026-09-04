# Instrucciones para quien implemente `PLAN-V4.md`

Este archivo es el contrato de trabajo del repositorio `Criptobox/prism-ai`.
No son buenas prácticas genéricas: **cada regla viene de un fallo real que ya
ocurrió aquí**, y al lado está el incidente que la provocó. Si algo te parece
excesivo, mira la columna de la derecha antes de saltártelo.

Léelo entero antes de escribir código.

---

## 0. Antes de nada

```bash
git clone https://github.com/Criptobox/prism-ai.git
cd prism-ai
npm ci
npm run dev
```

Lee `PLAN-V4.md` y `PLAN-EVOLUCION.md`. Empieza por el **punto 1** del plan
(adjuntos fuera de localStorage) salvo que se te diga otra cosa.

---

## 1. Cómo se entrega el trabajo

**Rama y pull request. Nunca un ZIP subido por la web de GitHub.**

```bash
git checkout -b mejora/lo-que-sea
# … trabajo …
git push -u origin mejora/lo-que-sea
```

> **Por qué.** Se entregaron tres lotes como ZIP y se subieron con «Add files
> via upload». Resultado: `package.json` quedó en 3.11.0 y `package-lock.json`
> en 3.9.0, la subida no puede borrar archivos, y un test E2E roto entró en
> `main` sin que nadie lo viera hasta que falló el CI.

Un commit por cambio con sentido. El mensaje explica **por qué**, no qué (el
diff ya dice qué).

---

## 2. La puerta: esto se ejecuta ENTERO antes de entregar

En este orden. Si algo sale rojo, no se entrega.

```bash
npm run lint          # eslint
npm run knip          # archivos y dependencias que no usa nadie
npm run build         # compila Y comprueba tipos
npm run test          # 674 unitarios
npm run test:e2e      # 85 E2E en Chromium
```

Y estas dos, que **no** están en el CI y son las que más han dolido:

```bash
# 1. El servidor de producción arranca de verdad, no solo compila
npm run build && npm start
curl localhost:3000/api/version    # tiene que responder
```

```bash
# 2. Compila como lo hace Vercel
rm -rf .next && VERCEL=1 npm run build
ls .next/next-server.js.nft.json   # tiene que existir
```

> **Por qué la primera.** Se subió código que compilaba y no arrancaba.
> **Por qué la segunda.** `output: "standalone"` rompe el constructor de Vercel
> con un `ENOENT: .next/next-server.js.nft.json`. Está apagado con
> `process.env.VERCEL`, pero cualquiera que toque `next.config.ts` puede
> resucitarlo. Costó un día de despliegues rotos.

---

## 3. Trampas concretas de este repositorio

### 3.1 No quites una dependencia sin mirar qué arrastraba

`bun-types` no lo usaba nadie y se quitó. Era lo único que traía `@types/node`,
que se quedó huérfano en el lockfile: **aquí seguía instalándose y en Vercel
no**. Todos los despliegues rotos durante un día, y el fallo no se podía
reproducir en local.

Antes de quitar cualquier paquete:

```bash
npm ci && npm run build       # en un clon limpio, no en tu carpeta de trabajo
```

### 3.2 La versión se sube con el script, nunca a mano

```bash
npm run bump -- patch|minor|major
```

Vive en `package.json` **y** en `src/lib/prism/app-version.ts`. Tocando solo
uno, Ajustes anunció «v3.1» durante cuatro versiones. Hay un test que lo vigila.

### 3.3 Archivos que no se sobrescriben enteros

`worklog.md` y `README.md` se **añaden**, no se reemplazan. Un lote entregó su
propia copia y estuvo a punto de borrar entradas anteriores.

### 3.4 `AGENTS.md` y `CLAUDE.md` los genera Next

Están en `.gitignore`. Si aparecen en tu `git status`, no los subas.

### 3.5 No ejecutes `npm run build` con `npm run dev` levantado

Comparten la carpeta `.next`. La build la reescribe por debajo y el servidor de
desarrollo se queda sirviendo restos: la app sale **en blanco con errores 500**
y **todos los E2E fallan** como si tuvieras un bug en el código.

Si de pronto se cae media suite, comprueba esto ANTES de tocar nada:

```bash
pkill -f next && rm -rf .next && npm run dev
```

Pasó revisando esta misma entrega: cinco tests en rojo, ninguno era del código.

### 3.6 Los adjuntos son data URLs base64 dentro del store

Es justo lo que vas a arreglar en el punto 1. Ten presente que cuando `persist`
de zustand no puede escribir, **no se guarda nada** —ni conversaciones ni
claves— y falla en silencio. La migración tiene que ser tolerante: si algo sale
mal, se conserva lo viejo.

---

## 4. Cómo se prueba (esto es lo que más se ha incumplido)

### Una función de interfaz necesita un test que abra la app y mire

Se entregó un componente `VersionLine` **que no llamaba nadie**. El commit decía
«en la barra lateral aparece la versión». Era código muerto y nadie lo notó en
semanas, porque ningún test miraba la pantalla.

Otro caso: un botón «Quitarlos» dentro de un aviso flotante. Al pulsarlo cerraba
el diálogo y no quitaba nada — el aviso vive fuera del diálogo y el clic contaba
como «fuera». Compilaba, se veía bien, y no funcionaba.

**Regla: si añades algo que el usuario ve o pulsa, hay un E2E que lo abre y lo
usa.** No vale comprobar que el componente existe.

### El test tiene que fallar sin tu cambio

Después de escribirlo, **quita tu cambio y ejecútalo**. Si sigue verde, el test
no prueba nada. Vuelve a ponerlo y dilo en el mensaje del commit:
«comprobado que se pone rojo si se quita X».

### No mires solo el efecto, mira el dato

Para «este ajuste llega al modelo», no compruebes que el botón se ilumina:
intercepta la petición y lee el prompt que viaja dentro. Hay un ejemplo hecho en
`tests/e2e/modos-agente.spec.ts`.

---

## 5. Reglas de contenido

- **Nada de prompts propietarios filtrados.** Ni de Cursor, ni de v0, ni de
  ningún repo de «system prompts». Se puede leer cómo están escritos; no se
  copia el texto. Este repo es público y MIT.
- **Nada copiado de proyectos GPL** (Chatbox entre ellos). Ideas sí, código no.
- **Sin números inventados.** Si un dato no se puede saber —una cuota que el
  proveedor no publica, un tiempo estimado—, se dice «sin dato». Un porcentaje
  falso en pantalla es peor que un hueco: la gente se fía de él.
- **Comentarios en español**, como el resto del repositorio, y explicando *por
  qué*, no qué hace la línea.

---

## 6. Qué contar al entregar

En el mensaje del commit o del pull request:

1. Qué comandos de la sección 2 ejecutaste y qué salió. Con números.
2. Qué probaste quitando tu cambio para ver el test en rojo.
3. **Lo que NO pudiste comprobar.** Esto no resta, suma.

> **Por qué.** Tres veces se dio por resuelto un fallo de despliegue sin haberlo
> reproducido. Las tres eran teorías falsas y costaron un día. Decir «no lo he
> podido reproducir, necesito el registro» habría ahorrado todo eso.

**No escribas que algo funciona si no lo has ejecutado.** Si un paso no lo
pudiste hacer, dilo con esas palabras.

---

## 7. Lo que no hay que hacer

- No reescribir la navegación ni introducir «workspaces».
- No añadir proveedores nuevos: hay 17 y sobran.
- No meter `esbuild-wasm`, `transformers.js` ni nada de varios MB sin pedirlo
  antes: esto es una PWA que se abre en un móvil.
- No tocar la promesa del producto: sin cuentas, sin servidor, las claves solo
  en el dispositivo. Cualquier idea que necesite guardar claves fuera está
  descartada de entrada.
- No ampliar el encargo por tu cuenta. Si ves otro problema, nómbralo aparte.

---

## 8. Resumen en cinco líneas

1. Rama y PR, nunca un ZIP por la web.
2. Los siete comandos de la sección 2, enteros, antes de entregar.
3. Lo que se ve o se pulsa lleva un E2E que lo abre y lo usa.
4. El test tiene que fallar sin tu cambio; compruébalo.
5. Di lo que no pudiste comprobar.
