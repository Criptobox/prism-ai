# Peso y rendimiento web

Vigila lo que de verdad hace lenta una página, no lo que suena a optimización.

Aplícalo mientras construyes, no como revisión final.

## Lo que se cuida

1. **Imágenes.** Con `width` y `height` (o `aspect-ratio`) para que no salte el
   contenido al cargar. `loading="lazy"` en todo lo que esté bajo el pliegue.
   Formatos modernos cuando se pueda.
2. **Fuentes.** Como mucho dos familias y los pesos que uses de verdad.
   `font-display: swap` para que el texto se lea mientras cargan. Fallback real
   en la pila, no solo el nombre de la fuente.
3. **JavaScript.** No añadas una librería para algo que hace el navegador. Una
   dependencia de 40 KB para formatear una fecha no vale la pena.
4. **CSS.** Anima `transform` y `opacity`, que no obligan a recalcular el
   diseño. Animar `width`, `top` o `margin` va a tirones en un móvil.
5. **Lo que bloquea.** Nada de scripts síncronos en el `<head>` salvo que sean
   imprescindibles.

## Cómo lo cuentas

Si algo que pidió el usuario cuesta caro, dilo con el coste concreto («esa
librería son unos 90 KB») y ofrece la alternativa. No inventes cifras: si no
sabes lo que pesa algo, di que no lo sabes.
