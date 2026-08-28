/** Prism AI — Logo vectorial reutilizable */
export function PrismLogo({
  size = 32,
  className,
  glow = false,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Prism AI"
      role="img"
    >
      <defs>
        <linearGradient id="pl-brand" x1="0.1" y1="0.95" x2="0.9" y2="0.05">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="0.52" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#F472B6" />
        </linearGradient>
        <linearGradient id="pl-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
        </linearGradient>
      </defs>
      {glow && <circle cx="256" cy="256" r="230" fill="url(#pl-brand)" opacity="0.14" />}
      <g strokeLinecap="round" opacity="0.85">
        <line x1="298" y1="246" x2="410" y2="172" stroke="#A78BFA" strokeWidth="13" />
        <line x1="302" y1="250" x2="428" y2="246" stroke="#67E8F9" strokeWidth="13" />
        <line x1="298" y1="254" x2="406" y2="322" stroke="#F9A8D4" strokeWidth="13" />
      </g>
      <path
        d="M 256 118 L 384 356 L 128 356 Z"
        fill="currentColor"
        fillOpacity="0.06"
        stroke="url(#pl-brand)"
        strokeWidth="19"
        strokeLinejoin="round"
      />
      <line x1="72" y1="292" x2="206" y2="272" stroke="url(#pl-beam)" strokeWidth="13" />
      <circle cx="206" cy="272" r="10" fill="currentColor" />
    </svg>
  );
}
