/** Prism AI — Plantillas de marketing ligadas a la dirección de diseño
 * (plan escalado §2.5). Útil para una tienda online: no como «plantillas
 * fijas» sino como MODOS que usan los mismos tokens del proyecto — así
 * el email, el carrusel o el póster salen con la misma identidad visual
 * que la web, no desconectados.
 *
 * Cada modo devuelve un prompt completo listo para el chat: le dice al
 * modelo QUÉ produce (formato exacto), con QUÉ tokens (paleta/tipografía
 * de la dirección actual del proyecto) y contra QUÉ checklist se corrige.
 *
 * Inspirado en las plantillas de marketing de OpenDesign (Apache-2.0):
 * email-marketing, social-carousel, magazine-poster — adaptadas a los
 * modos de Prism, no copiadas.
 */

import type { DireccionVisual } from "./design-directions";
import { CHECKLIST_ANTI_SLOP, direccionPorId, elegirDireccion } from "./design-directions";

export type ModoMarketing = "email" | "carrusel" | "poster";

export interface ModoInfo {
  id: ModoMarketing;
  nombre: string;
  icono: string;
  /** qué produce, en una línea */
  descripcion: string;
}

export const MODOS_MARKETING: readonly ModoInfo[] = [
  {
    id: "email",
    nombre: "Email de marca",
    icono: "✉️",
    descripcion: "Newsletter o anuncio a prueba de clientes de correo (tablas, no divs modernos).",
  },
  {
    id: "carrusel",
    nombre: "Carrusel social",
    icono: "📱",
    descripcion: "Tres tarjetas de 1080×1080 para Instagram/Facebook, una idea por tarjeta.",
  },
  {
    id: "poster",
    nombre: "Póster / banner",
    icono: "🖼️",
    descripcion: "Layout tipo revista de una sola página: promos, flyers digitales, banners.",
  },
];

/** Los tokens de la dirección en un bloque compacto para el prompt. */
function tokensDe(d: DireccionVisual): string {
  return [
    `- Paleta: fondo ${d.paleta.fondo}, superficie ${d.paleta.superficie}, texto ${d.paleta.texto}, secundario ${d.paleta.textoSuave}, acento ${d.paleta.acento}, acento2 ${d.paleta.acento2}.`,
    `- Tipografía: ${d.fuentes.display} (titulares) + ${d.fuentes.cuerpo} (cuerpo) + ${d.fuentes.mono} (mono).`,
    `- Forma: radios ${d.radios}; sombras ${d.sombras}.`,
    `- Carácter: ${d.detalle}`,
  ].join("\n");
}

const CABECERA = (modo: string) =>
  `## MODO MARKETING: ${modo.toUpperCase()}\nUsa EXACTAMENTE los tokens de la dirección del proyecto. Nada de inventar otra paleta ni otra tipografía: el material tiene que salir como de la misma casa.`;

// la misma checklist anti-slop que usa la generación de UI: un material
// de marketing genérico es igual de inútil que una web genérica
const CHECKLIST = CHECKLIST_ANTI_SLOP;

/** Email de marca: HTML a prueba de Gmail/Outlook (tablas). */
export function promptEmail(
  encargo: string,
  d: DireccionVisual
): string {
  return [
    CABECERA("email de marca"),
    `Encargo: ${encargo}`,
    "Produce UN archivo HTML completo de email (600px de ancho) que funcione en Gmail, Outlook y móvil:",
    "- Layout con <table> y estilos inline (los clientes de correo no soportan flex/grid ni <style> fiable).",
    "- Cabecera con el nombre de la marca en tipografía display, una imagen hero opcional (etiqueta alt), el mensaje principal, un botón CTA con la paleta de acento y pie legal.",
    "- Tipografía con fallbacks de sistema (la fuente display solo en titulares con font-family y fallback serif/sans).",
    tokensDe(d),
    CHECKLIST,
  ].join("\n");
}

/** Carrusel social: 3 tarjetas 1080×1080 en un solo HTML para exportar. */
export function promptCarrusel(encargo: string, d: DireccionVisual): string {
  return [
    CABECERA("carrusel social"),
    `Encargo: ${encargo}`,
    "Produce UN archivo HTML con TRES tarjetas apiladas de 1080×1080px (comenta el borde de corte entre tarjetas):",
    "- Tarjeta 1: gancho (titular enorme que promete algo).",
    "- Tarjeta 2: desarrollo (el argumento o el producto, con datos/beneficios concretos).",
    "- Tarjeta 3: cierre con CTA claro (qué hacer, dónde).",
    "- Cada tarjeta: una sola idea, texto mínimo legible en móvil (titular ≥ 72px), composición distinta entre tarjetas pero misma identidad visual.",
    "- Usa la fuente display para titulares y respeta la paleta exacta; fondo de cada tarjeta de la paleta, NO blanco genérico.",
    tokensDe(d),
    CHECKLIST,
  ].join("\n");
}

/** Póster / banner: layout tipo revista de una página. */
export function promptPoster(encargo: string, d: DireccionVisual): string {
  return [
    CABECERA("póster promocional"),
    `Encargo: ${encargo}`,
    "Produce UN archivo HTML de UNA sola pantalla (1280×1600 aprox.) con composición editorial:",
    "- Un titular que ocupe espacio real (no un H1 tímido), jerarquía de primera lectura en 3 segundos.",
    "- La oferta o el mensaje principal con datos concretos (precio, fecha, beneficio) y UNA llamada a la acción.",
    "- Composición con intención: asimetría o retícula rota, sin tres columnas iguales ni hero centrado genérico.",
    "- Detalles de la dirección: filetes, numeración, texturas, rotaciones leves… lo que dicte el estilo, no adornos sueltos.",
    tokensDe(d),
    CHECKLIST,
  ].join("\n");
}

/** El prompt del modo pedido, con la dirección resuelta (del proyecto o
 * del propio encargo). */
export function promptDeModo(
  modo: ModoMarketing,
  encargo: string,
  ultimoDiseno?: string | null
): string {
  // la dirección del proyecto manda si hay una: el material sale de la
  // misma casa que la web que ya tienes (filosofía DESIGN.md)
  const existente = ultimoDiseno ? direccionPorId(ultimoDiseno) : null;
  if (existente) {
    switch (modo) {
      case "email":
        return promptEmail(encargo, existente);
      case "carrusel":
        return promptCarrusel(encargo, existente);
      case "poster":
        return promptPoster(encargo, existente);
    }
  }
  const eleccion = elegirDireccion(encargo);
  switch (modo) {
    case "email":
      return promptEmail(encargo, eleccion.direccion);
    case "carrusel":
      return promptCarrusel(encargo, eleccion.direccion);
    case "poster":
      return promptPoster(encargo, eleccion.direccion);
  }
}

/* ------------------------------------------------------------------ */
/* inserción por slash: resolver la plantilla en el momento           */
/* ------------------------------------------------------------------ */

/** Marcadores que `slash.ts` deja en `template` para que se resuelvan
 * AQUÍ, en el momento de insertar: así los tokens salen de la dirección
 * del proyecto SI YA EXISTE (misma casa), o se eligen frescas si no. */
export function resolverPlantillaMarketing(
  template: string,
  encargo = "[describe aquí tu producto, promoción o mensaje]",
  ultimoDiseno?: string | null
): string {
  const modo: ModoMarketing | null = template.includes("__MARKETING_EMAIL__")
    ? "email"
    : template.includes("__MARKETING_CARRUSEL__")
      ? "carrusel"
      : template.includes("__MARKETING_POSTER__")
        ? "poster"
        : null;
  if (!modo) return template;
  // la dirección del proyecto manda si hay una: el material sale de la
  // misma casa que la web que ya tienes (filosofía DESIGN.md)
  if (ultimoDiseno) {
    const d = direccionPorId(ultimoDiseno);
    if (d) {
      switch (modo) {
        case "email":
          return promptEmail(encargo, d);
        case "carrusel":
          return promptCarrusel(encargo, d);
        case "poster":
          return promptPoster(encargo, d);
      }
    }
  }
  return promptDeModo(modo, encargo, ultimoDiseno ?? undefined);
}
