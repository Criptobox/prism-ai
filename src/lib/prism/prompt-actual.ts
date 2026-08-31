"use client";
/** Prism AI — Las piezas del prompt tal y como están AHORA MISMO.
 *
 * Vive fuera de `chat-app` porque hay dos sitios que necesitan lo mismo: el
 * que manda el mensaje y el medidor de Ajustes. Si cada uno se lo montara por
 * su cuenta, el medidor enseñaría un número que no es el que viaja — y un
 * número falso es peor que no enseñar ninguno.
 */
import { usePrism } from "./store";
import { reglasActivas, useFailures } from "./failures";
import { agentPrompt } from "./agent-loop";
import { textoDeModos } from "./agent-modes";
import { analyzeSkillPermissions, renderPermisosPrompt } from "./skill-permissions";
import { buildPassport, renderPassportForPrompt } from "./passport";
import { deriveMapFromMessages, renderMapForPrompt } from "./project-map";
import type { EntradaPrompt } from "./presupuesto";

/** Textos de los estilos de salida. Fuera de la función para que se puedan
 *  medir sin montar nada. */
export const TEXTO_ESTILO = {
  conciso:
    "[Estilo: conciso] Responde TERSE y directo: sin relleno, sin preámbulos ni despedidas, sin repetir la pregunta. Frases cortas. El código y los datos técnicos se conservan exactos.",
  detallado:
    "[Estilo: detallado] Responde de forma completa y pedagógica: explica el razonamiento paso a paso, incluye ejemplos y advierte los errores comunes.",
} as const;

export function entradaPromptActual(sessionId?: string): EntradaPrompt {
  const st = usePrism.getState();

  const estilo =
    st.settings.outputStyle === "conciso"
      ? TEXTO_ESTILO.conciso
      : st.settings.outputStyle === "detallado"
        ? TEXTO_ESTILO.detallado
        : null;

  const modos = textoDeModos(st.settings.agentModes ?? []) || null;

  const activas = st.skills.filter((s) => s.enabled);
  const skills = activas.length
    ? activas.map((s) => `### Skill activa: ${s.name}\n${s.instructions}`).join("\n\n")
    : null;
  // Límites de las skills: lo que declaren con permisos sensibles se le
  // recuerda al modelo como techo — una skill no manda por encima del usuario.
  const permisos = activas.length
    ? renderPermisosPrompt(
        activas.map((s) => s.name),
        activas.map((s) => s.permissions ?? analyzeSkillPermissions(s.instructions))
      )
    : null;

  // Memoria de fallos: reglas aprendidas de errores verificables de intentos
  // anteriores. El agente las consulta antes de actuar, que es donde sirven.
  const agente = st.settings.agentMode
    ? agentPrompt(st.settings.agentMaxLoops, reglasActivas(useFailures.getState().entries))
    : null;

  let ficha: string | null = null;
  let mapa: string | null = null;
  const session = sessionId ? st.sessions.find((s) => s.id === sessionId) : null;
  if (session) {
    const map = session.projectMap ?? deriveMapFromMessages(session.messages);
    ficha = renderPassportForPrompt(buildPassport(map));
    mapa = renderMapForPrompt(map);
  }

  return {
    sistema: st.settings.systemPrompt.trim(),
    estilo,
    modos,
    skills,
    permisos,
    agente,
    ficha,
    mapa,
    ahorro: !!st.settings.ahorro,
  };
}

/** Cuánto ocupa una skill concreta dentro del prompt, con su cabecera.
 *  Es lo que se enseña al lado de cada una para que se vea el precio. */
export function costeDeSkill(nombre: string, instrucciones: string): number {
  return `### Skill activa: ${nombre}\n${instrucciones}`.length;
}
