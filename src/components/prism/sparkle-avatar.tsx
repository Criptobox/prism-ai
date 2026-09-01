/** Prism AI — SparkleAvatar: avatar del asistente en el chat.
 *
 * Solo el icono «sparkle» (estrella de 4 puntas con signo «+» y punto
 * decorativo), SIN contenedor alrededor — pinta directo sobre el
 * fondo del chat. El glow sutil del cian de marca lo mantiene legible
 * sobre cualquier fondo (claro u oscuro).
 *
 * El color hereda del tema: usa `var(--prism-violet)` por defecto (el
 * acento principal), de modo que cuando el usuario cambia de acento en
 * Ajustes (esmeralda, ámbar, rosa, cian, naranja…) el avatar cambia
 * con él. Si prefieres el cian fijo de marca, cambia `--prism-violet`
 * por `--prism-cyan` en el `style.color`.
 */
import { cn } from "@/lib/utils";

export function SparkleAvatar({
  size = 22,
  className,
  generating = false,
}: {
  size?: number;
  className?: string;
  /** true mientras la IA está escribiendo — aplica el pulso de marca */
  generating?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", generating && "generating", className)}
      style={{ width: size, height: size, color: "var(--prism-violet)" }}
      aria-label="Asistente Prism AI"
      role="img"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: "drop-shadow(0 0 4px color-mix(in oklab, var(--prism-violet) 55%, transparent))",
        }}
        aria-hidden
      >
        {/* Estrella principal de 4 puntas (sparkle) */}
        <path
          d="M12 2.5C12.4 7 13.2 8.8 14.7 10.3C16.2 11.8 18 12.6 21.5 13C18 13.4 16.2 14.2 14.7 15.7C13.2 17.2 12.4 19 12 21.5C11.6 19 10.8 17.2 9.3 15.7C7.8 14.2 6 13.4 2.5 13C6 12.6 7.8 11.8 9.3 10.3C10.8 8.8 11.6 7 12 2.5Z"
          fill="currentColor"
        />
        {/* Signo + en la esquina superior derecha */}
        <path
          d="M18 5.5V8.5M16.5 7H19.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Punto decorativo inferior izquierdo */}
        <circle cx="5.5" cy="18.5" r="1.3" fill="currentColor" opacity="0.85" />
      </svg>
    </span>
  );
}
