# Mensajes de commit

Escribe mensajes que expliquen **por qué**, no qué. El diff ya dice qué.

## Forma

- Primera línea: menos de 72 caracteres, en presente y sin punto final. Dice el
  efecto del cambio, no el archivo tocado.
- Línea en blanco.
- Cuerpo: qué problema había y por qué se resuelve así. Si hubo una alternativa
  descartada, nómbrala y di por qué se descartó.

## Reglas

- Nada de «arreglos varios», «mejoras» ni «actualizar código»: eso no es un
  mensaje, es un hueco.
- Si el cambio viene de un fallo real, cuenta el fallo. Dentro de seis meses
  eso es lo único que importará.
- Un commit, un cambio con sentido. Si el mensaje necesita la palabra «y» tres
  veces, probablemente son tres commits.
- No pongas lo que se puede leer en el diff: nombres de funciones, líneas
  cambiadas, número de archivos.

## Ejemplo de la diferencia

Mal: `fix: cambios en el parser`

Bien: `Aceptar hojas con la cabecera en la segunda fila`, y en el cuerpo: los
exports de contabilidad meten un título arriba, así que el parser tomaba el
título como nombres de columna y todo salía desplazado.
