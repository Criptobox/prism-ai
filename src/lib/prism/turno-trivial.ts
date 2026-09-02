/** Prism AI — Un saludo no es un encargo.
 *
 * Escribías «Hola» en una conversación donde ya habías pedido una página, y el
 * modelo contestaba con el bucle del agente entero: plan, pasos, y «he
 * actualizado index.html». Nadie le había pedido que tocara nada.
 *
 * No es culpa del modelo. Con el modo agente encendido, TODOS los turnos
 * llevaban delante la plantilla del agente —«estructuras tu respuesta
 * EXACTAMENTE con estas etiquetas», «continúa OBLIGATORIAMENTE»— más el
 * catálogo de herramientas. La regla que decía «si la tarea es trivial,
 * responde normal» era la número 4 de cinco, enterrada bajo dos mayúsculas
 * imperativas. Pedirle a un modelo gratis de 8k que se acuerde de esa línea
 * es confiar en la suerte; decidirlo aquí es determinista.
 *
 * Así que en un turno trivial no se manda la plantilla ni las herramientas.
 * El modelo no tiene con qué montar un plan y contesta como una persona.
 *
 * El riesgo de esta función es al revés de lo que parece: dar por trivial un
 * encargo de verdad sería quitarle el agente a quien lo necesita. Por eso todo
 * lo dudoso cuenta como NO trivial.
 */
import { classifyTask } from "./task-router";

/** Más de esto ya no es un saludo, sea lo que sea. */
const MAX_PALABRAS = 8;

/** Saludos y cortesías, como mensaje ENTERO. */
const CORTESIA =
  /^(hola|holas|buenas|buenos dias|buenas tardes|buenas noches|hey|ey|hi|hello|que tal|como estas|como va|todo bien|gracias|muchas gracias|mil gracias|ok|oka|okey|vale|perfecto|genial|entendido|listo|adios|chao|hasta luego|nos vemos|buen dia|saludos|test|prueba|probando)$/;

/** Señales de que hay un encargo, por corto que sea el mensaje. */
const HAY_ENCARGO =
  /(https?:\/\/|```|<[a-z]+>|\.(html?|css|js|ts|json|md|py|zip)\b|\barregl|\bcorrig|\bcambi|\bañad|\banade|\bagreg|\bquita|\bborra|\bcrea|\bhaz|\bhaz?me|\bpon|\bmejor|\bsigue|\bcontinua|\brevisa|\bexplica|\bresume|\btraduce|\bgenera|\bescrib|\bdiseñ|\bimplementa|\bactualiza|\binstala|\bprueba a\b)/;

/** Deja solo lo comparable: minúsculas, sin tildes, sin signos ni emoji. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿Este turno es un saludo o una cortesía, y no un encargo?
 *
 * Solo dice que sí cuando está claro: mensaje corto, sin nada que huela a
 * tarea, y que el clasificador tampoco reconoce como web/código/datos/etc.
 */
export function esTurnoTrivial(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (!t) return false; // un mensaje vacío no se manda; no es asunto de aquí
  if (t.length > 80) return false;

  const n = normalizar(t);
  if (!n) return false; // solo signos o emoji: no se decide nada
  if (n.split(" ").length > MAX_PALABRAS) return false;
  if (HAY_ENCARGO.test(n)) return false;
  // el clasificador manda: si huele a web, código, datos, escritura o
  // razonamiento, esto no es un saludo
  if (classifyTask(t).kind !== "chat") return false;

  return CORTESIA.test(n);
}
