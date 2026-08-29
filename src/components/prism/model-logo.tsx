"use client";
/**
 * Prism AI — Logos de marca por modelo.
 * Detecta la familia del modelo por su ID (gpt→OpenAI, claude→Anthropic,
 * gemini→Google, kimi→Moonshot, deepseek, llama→Meta, qwen, glm→Z.ai,
 * grok→xAI, mistral, groq, phi→Microsoft, command→Cohere…) y pinta un
 * logo SVG inline con la marca. Sin peticiones externas (funciona offline).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ModelBrand =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "moonshot"
  | "meta"
  | "qwen"
  | "zai"
  | "xai"
  | "mistral"
  | "groq"
  | "ollama"
  | "microsoft"
  | "cohere"
  | "openrouter"
  | "nvidia"
  | "cerebras"
  | "generic";

export function detectModelBrand(modelId: string, providerId?: string | null): ModelBrand {
  const id = (modelId || "").toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => id.includes(w));
  if (has("deepseek")) return "deepseek";
  if (has("kimi", "moonshot")) return "moonshot";
  if (has("claude", "anthropic")) return "anthropic";
  if (has("gemini", "gemma")) return "google";
  if (has("gpt", "openai", "davinci", "chatgpt") || /^o[134](-|$)/.test(id)) return "openai";
  if (has("llama")) return "meta";
  if (has("qwen", "qwq")) return "qwen";
  if (has("glm", "zhipu", "chatglm")) return "zai";
  if (has("grok")) return "xai";
  if (has("mistral", "mixtral", "codestral", "ministral", "pixtral", "magistral", "devstral")) return "mistral";
  if (has("phi-")) return "microsoft";
  if (has("command-", "cohere")) return "cohere";
  if (has("groq")) return "groq";
  if (has("nemotron")) return "nvidia";
  // Fallback por proveedor cuando el ID no revela la familia
  if (providerId === "ollama") return "ollama";
  if (providerId === "groq") return "groq";
  if (providerId === "gemini") return "google";
  if (providerId === "zai") return "zai";
  if (providerId === "openrouter") return "openrouter";
  if (providerId === "kimi") return "moonshot";
  if (providerId === "nvidia") return "nvidia";
  if (providerId === "mistral") return "mistral";
  if (providerId === "cerebras") return "cerebras";
  return "generic";
}

/** Rect base del tile con esquinas redondeadas */
const tile = (fill: string, stroke = true) => (
  <>
    <rect width="24" height="24" rx="6" fill={fill} />
    {stroke && (
      <rect width="23" height="23" x="0.5" y="0.5" rx="5.5" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
    )}
  </>
);

/** Starburst de 8 rayos (estilo Claude) */
const burst = (stroke: string) => {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const r1 = 3.1;
    const r2 = 7.6;
    return (
      <line
        key={i}
        x1={12 + Math.cos(a) * r1}
        y1={12 + Math.sin(a) * r1}
        x2={12 + Math.cos(a) * r2}
        y2={12 + Math.sin(a) * r2}
      />
    );
  });
  return (
    <g stroke={stroke} strokeWidth="2.4" strokeLinecap="round">
      {rays}
    </g>
  );
};

const BRANDS: Record<ModelBrand, ReactNode> = {
  // OpenAI — nudo blanco sobre negro (path oficial simplificado a 24px)
  openai: (
    <>
      {tile("#0D0D0D")}
      <g transform="translate(4.2 4.2) scale(0.65)" fill="#FFFFFF">
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
      </g>
    </>
  ),
  // Anthropic / Claude — starburst terracota
  anthropic: (
    <>
      {tile("#D97757")}
      {burst("#FFFFFF")}
    </>
  ),
  // Google Gemini — chispa con degradado oficial
  google: (
    <>
      {tile("#FFFFFF")}
      <defs>
        <linearGradient id="prismLogoGem" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="0.55" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 3.2c.82 5.06 3.74 7.98 8.8 8.8-5.06.82-7.98 3.74-8.8 8.8-.82-5.06-3.74-7.98-8.8-8.8 5.06-.82 7.98-3.74 8.8-8.8Z"
        fill="url(#prismLogoGem)"
      />
    </>
  ),
  // DeepSeek — ballena estilizada (olas) sobre azul oficial
  deepseek: (
    <>
      {tile("#4D6BFE")}
      <g fill="none" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round">
        <path d="M5.2 10.6c2.4-2.5 4.8-2.5 6.8-.4 2 2.1 4.4 2.1 6.8-.4" />
        <path d="M5.2 14.9c2.4-2.5 4.8-2.5 6.8-.4 2 2.1 4.4 2.1 6.8-.4" opacity="0.75" />
      </g>
    </>
  ),
  // Moonshot / Kimi — luna sobre degradado azul-violeta
  moonshot: (
    <>
      <defs>
        <linearGradient id="prismLogoKimi" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#prismLogoKimi)" />
      <path
        d="M14.8 5.4a7.4 7.4 0 1 0 3.9 9.9A6.4 6.4 0 0 1 14.8 5.4Z"
        fill="#FFFFFF"
      />
      <circle cx="17.3" cy="7.1" r="1.15" fill="#FFFFFF" opacity="0.9" />
    </>
  ),
  // Meta / Llama — infinito azul oficial
  meta: (
    <>
      {tile("#0866FF")}
      <path
        d="M5.4 12c0-2.3 1.5-4 3.3-4 3 0 5.1 8 8.1 8 1.8 0 3.3-1.7 3.3-4s-1.5-4-3.3-4c-3 0-5.1 8-8.1 8-1.8 0-3.3-1.7-3.3-4Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
    </>
  ),
  // Qwen — flor geométrica de 6 pétalos sobre violeta oficial
  qwen: (
    <>
      {tile("#6236FF")}
      <g fill="none" stroke="#FFFFFF" strokeWidth="1.7">
        <ellipse cx="12" cy="12" rx="7.2" ry="2.9" />
        <ellipse cx="12" cy="12" rx="7.2" ry="2.9" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="7.2" ry="2.9" transform="rotate(120 12 12)" />
      </g>
      <circle cx="12" cy="12" r="1.5" fill="#FFFFFF" />
    </>
  ),
  // Z.ai / GLM — Z blanca sobre negro
  zai: (
    <>
      {tile("#111111")}
      <path
        d="M7.6 7.2h8.8L7.6 16.8h8.8"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  // xAI / Grok — X blanca sobre negro
  xai: (
    <>
      {tile("#000000")}
      <g stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round">
        <path d="M7 6.4 17.4 17.6" />
        <path d="M17.4 6.4 7 17.6" />
      </g>
    </>
  ),
  // Mistral — M pixelada con degradado amarillo→rojo
  mistral: (() => {
    const rows = ["#FFD800", "#FFAF00", "#FF8205", "#FA500F", "#E10500"];
    const pattern = [
      [0, 4],
      [0, 1, 3, 4],
      [0, 2, 4],
      [0, 4],
      [0, 4],
    ];
    const cell = 2.55;
    const gap = 0.55;
    const origin = 4.35;
    const rects: ReactNode[] = [];
    pattern.forEach((cols, r) => {
      for (const c of cols) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={origin + c * (cell + gap)}
            y={origin + r * (cell + gap)}
            width={cell}
            height={cell}
            fill={rows[r]}
          />
        );
      }
    });
    return (
      <>
        {tile("#FFFFFF")}
        {rects}
      </>
    );
  })(),
  // Groq — destello naranja oficial
  groq: (
    <>
      {tile("#F55036")}
      <g fill="#FFFFFF">
        <circle cx="12" cy="12" r="2.1" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <rect
              key={i}
              x={11.15}
              y={3.4}
              width={1.7}
              height={3.1}
              rx={0.85}
              transform={`rotate(${(a * 180) / Math.PI + 90} 12 12)`}
            />
          );
        })}
      </g>
    </>
  ),
  // Ollama — cabeza de llama
  ollama: (
    <>
      {tile("#101010")}
      <g fill="#FFFFFF">
        <ellipse cx="9.3" cy="7.6" rx="1.5" ry="2.1" />
        <ellipse cx="14.7" cy="7.6" rx="1.5" ry="2.1" />
        <rect x="7" y="8.6" width="10" height="9" rx="3.1" />
      </g>
      <circle cx="10.1" cy="15.2" r="0.75" fill="#101010" />
      <circle cx="13.9" cy="15.2" r="0.75" fill="#101010" />
    </>
  ),
  // Microsoft / Phi — cuatro cuadrados
  microsoft: (
    <>
      {tile("#FFFFFF")}
      <rect x="6.6" y="6.6" width="4.9" height="4.9" fill="#F25022" />
      <rect x="12.5" y="6.6" width="4.9" height="4.9" fill="#7FBA00" />
      <rect x="6.6" y="12.5" width="4.9" height="4.9" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="4.9" height="4.9" fill="#FFB900" />
    </>
  ),
  // Cohere — C en anillo abierto
  cohere: (
    <>
      {tile("#39594D")}
      <circle
        cx="12"
        cy="12"
        r="5.6"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="26.5 8.7"
        strokeDashoffset="-4.5"
      />
    </>
  ),
  // NVIDIA NIM — ojo verde
  nvidia: (
    <>
      {tile("#76B900", false)}
      <path
        d="M4.4 15.2c2.6-3 5.6-4.9 9.2-5.7 1.7 1.4 3.2 3.1 4.4 5.1-3.2-2.2-6.8-3.4-10.8-3.4-1 0-1.9.1-2.8.3Z"
        fill="#FFFFFF"
      />
      <path d="M6.2 8.6c2.4-.7 5-.7 7.5.1C11.6 7.4 9 7.3 6.2 8.6Z" fill="#FFFFFF" opacity="0.85" />
    </>
  ),
  // Cerebras — chip naranja
  cerebras: (
    <>
      {tile("#F15A24")}
      <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
      <rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1" fill="#FFFFFF" />
    </>
  ),
  // OpenRouter — portal triangular
  openrouter: (
    <>
      {tile("#1F2333")}
      <path
        d="M12 6.2 18 17H6L12 6.2Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="14.2" r="1.5" fill="#FFFFFF" />
    </>
  ),
  // Genérico Prism — chispa con degradado de la marca
  generic: (
    <>
      <defs>
        <linearGradient id="prismLogoGeneric" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#prismLogoGeneric)" />
      <path
        d="M12 4.4c.68 4.2 3.1 6.62 7.6 7.6-4.5.98-6.92 3.4-7.6 7.6-.68-4.2-3.1-6.62-7.6-7.6 4.5-.98 6.92-3.4 7.6-7.6Z"
        fill="#FFFFFF"
      />
    </>
  ),
};

export function ModelLogo({
  modelId,
  providerId,
  className,
}: {
  modelId: string;
  providerId?: string | null;
  className?: string;
}) {
  const brand = detectModelBrand(modelId, providerId);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[5px]",
        "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="size-full" role="img" aria-label={brand}>
        {BRANDS[brand]}
      </svg>
    </span>
  );
}
