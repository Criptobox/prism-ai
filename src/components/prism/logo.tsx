/** Prism AI — Logo vectorial reutilizable.
 *
 * v3 (v3.34.3): rediseñado para verse nítido a cualquier tamaño.
 * - Triángulo con fill de degradado MÁS opaco (0.35 → antes 0.06)
 * - Trazos más gruesos (6 en vez de 4) y cortos para no perderse
 * - Rayos simplificados a 3 líneas rectas más visibles
 * - ViewBox compacto (menos espacio vacío alrededor)
 * - Brillo interior que da profundidad al prisma
 *
 * Se usa en: cabecera de la barra lateral (26px), bienvenida (56px con
 * glow), trace del agente (18px), onboarding. El SparkleAvatar va
 * aparte para las burbujas del chat. */
import { useId } from "react";

export function PrismLogo({
  size = 32,
  className,
  glow = false,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  // id único por instancia: si hay dos logos en la misma página, los
  // gradientes no se pisan (bug clásico de SVG con ids compartidos).
  //
  // Con `Math.random()` el id salía DISTINTO en el servidor y en el cliente:
  // React lo cantaba como fallo de hidratación, y en desarrollo eso levanta
  // el overlay de error de Next, que tapa la pantalla entera —12 E2E caían
  // por clics interceptados que no tenían nada que ver con lo que probaban.
  // `useId` da un id estable entre servidor y cliente y distinto por
  // instancia, que es exactamente lo que hacía falta.
  const reactId = useId();
  const uid = `${size}-${glow ? "g" : "p"}-${reactId.replace(/:/g, "")}`;
  const gradId = `pl-grad-${uid}`;
  const beamId = `pl-beam-${uid}`;
  const fillId = `pl-fill-${uid}`;
  const shineId = `pl-shine-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Prism AI"
      role="img"
    >
      <defs>
        {/* Degradado principal de marca: violeta → azul → cian */}
        <linearGradient id={gradId} x1="0.15" y1="0.9" x2="0.85" y2="0.1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="0.5" stopColor="#6D5EF0" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        {/* Haz de luz entrante: blanco translúcido → sólido */}
        <linearGradient id={beamId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.15" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.95" />
        </linearGradient>
        {/* Fill interior del prisma: degradado de marca translúcido */}
        <linearGradient id={fillId} x1="0.2" y1="0.85" x2="0.8" y2="0.15">
          <stop offset="0" stopColor="#8B5CF6" stopOpacity="0.32" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0.18" />
        </linearGradient>
        {/* Brillo superior izquierdo del prisma (luz que entra) */}
        <linearGradient id={shineId} x1="0.3" y1="0.2" x2="0.6" y2="0.6">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* halo cuando se pide glow (bienvenida) */}
      {glow && (
        <circle cx="50" cy="50" r="46" fill={`url(#${fillId})`} opacity="0.55" />
      )}

      {/* rayos a la derecha del prisma — 3 líneas rectas, gruesas y visibles */}
      <g strokeLinecap="round" opacity="0.95">
        <line x1="60" y1="46" x2="88" y2="32" stroke="#A78BFA" strokeWidth="4" />
        <line x1="62" y1="50" x2="90" y2="50" stroke="#67E8F9" strokeWidth="4" />
        <line x1="60" y1="54" x2="86" y2="68" stroke="#F9A8D4" strokeWidth="4" />
      </g>

      {/* prisma (triángulo) — fill sólido + borde grueso con degradado */}
      <path
        d="M 50 20 L 80 74 L 20 74 Z"
        fill={`url(#${fillId})`}
        stroke={`url(#${gradId})`}
        strokeWidth="5.5"
        strokeLinejoin="round"
      />

      {/* brillo interior: triángulo más pequeño arriba-izq, da profundidad */}
      <path
        d="M 50 28 L 64 52 L 36 52 Z"
        fill={`url(#${shineId})`}
        opacity="0.6"
      />

      {/* haz de luz entrante (línea diagonal izquierda + punto de impacto) */}
      <line
        x1="8"
        y1="56"
        x2="34"
        y2="52"
        stroke={`url(#${beamId})`}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="34" cy="52" r="3" fill="#fff" opacity="0.95" />
    </svg>
  );
}
