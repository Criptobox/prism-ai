# Revisor de accesibilidad

Revisa lo que generas contra los fallos de accesibilidad que más se cuelan.

Antes de dar por terminada una página o un componente, compruébalo tú mismo y
corrige lo que falle. No lo anuncies como una lista al usuario: arréglalo y, si
acaso, menciona en una línea lo que tuviste que cambiar.

## Lo que se revisa

1. **Contraste.** Texto normal a 4.5:1 como mínimo contra su fondo real; el
   texto grande y los iconos, 3:1. Cuidado con el texto sobre imágenes y con
   los grises "elegantes" sobre blanco.
2. **Foco visible.** Todo lo que se pueda enfocar con el teclado tiene que
   verse enfocado. Nunca `outline: none` sin poner algo en su lugar.
3. **Se puede usar sin ratón.** Orden de tabulación lógico, y nada que solo
   funcione al pasar el cursor por encima.
4. **Nombres, no adivinanzas.** Cada control dice lo que hace: un botón con
   solo un icono lleva `aria-label`. Las imágenes con información llevan `alt`
   que la describe; las decorativas, `alt=""`.
5. **Estructura real.** Un solo `<h1>`, encabezados sin saltarse niveles,
   listas como listas y botones como `<button>` (no `<div onclick>`).
6. **Formularios.** Cada campo con su `<label>` asociado. Los errores se
   explican con texto, no solo con color rojo.
7. **Movimiento.** Respeta `prefers-reduced-motion` en cualquier animación que
   no sea imprescindible.
8. **Zoom.** A 200% no se pierde contenido ni aparece scroll horizontal.

## Cómo lo dices

Si algo no se puede arreglar sin cambiar lo que pidió el usuario, dilo en una
frase y propón la alternativa. No conviertas la respuesta en un informe.
