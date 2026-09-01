"use client";
/** Prism AI — Renderizado de markdown con código resaltado.
 *
 * v3 (v3.34.3): contenedor de código rediseñado.
 * - wrap REAL: `overflow-wrap: anywhere` + `word-break: break-all` en
 *   los spans de highlight.js, que antes no rompían y salían del bloque.
 * - Cabecera con punto de color (estilo terminal) + lenguaje + copiar.
 * - Scrollbar fino horizontal como red de seguridad (pero las líneas
 *   largas se envuelven, no hacen falta flechas).
 * - Borde con acento del tema sutil, fondo más oscuro que el card. */
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/atom-one-dark.css";
import { Check, Copy } from "lucide-react";

interface CodeProps {
  className?: string;
  children?: React.ReactNode;
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const el = children as { props?: CodeProps } | undefined;
  const props = el?.props;
  const className: string = props?.className ?? "";
  const lang = /language-(\w[\w+-]*)/.exec(className)?.[1] ?? "código";
  const code = extractText(props?.children);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* portapapeles no disponible */
    }
  };

  return (
    <div
      className="group/code my-3 overflow-hidden rounded-xl border border-prism-violet/20 bg-[#0B0E17] text-[#E6E9F2] shadow-md shadow-black/30"
      data-lang={lang}
    >
      {/* Cabecera estilo terminal: 3 puntos + lenguaje + copiar */}
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-gradient-to-r from-white/[0.04] to-transparent px-3 py-1.5">
        <div className="flex items-center gap-2">
          {/* 3 puntos estilo terminal macOS */}
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="ml-1 font-mono text-[11px] uppercase tracking-wider text-white/55">
            {lang}
          </span>
        </div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/55 transition hover:bg-white/10 hover:text-white"
          aria-label="Copiar código"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      {/* Cuerpo del código.
       * - `pre-wrap` + `overflow-wrap: anywhere` envuelve líneas largas.
       * - El CSS global (ver estilo embebido) fuerza `word-break: break-all`
       *   en los spans de highlight.js, que por defecto son inline y no
       *   rompen — era la causa de que el código se saliera del bloque.
       * - `overflow-x: auto` como red de seguridad por si algo se resiste. */}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          margin: 0,
          padding: "0.95rem 1.1rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.845rem",
          lineHeight: 1.65,
          overflowX: "auto",
        }}
      >
        {children}
      </pre>
      {/* CSS embebido: fuerza a los tokens de highlight.js a romper líneas
          largas. Se inyecta una sola vez por bloque (React lo dedupe). */}
      <style>{`
        .group/code pre span.token,
        .group/code pre span.hljs-keyword,
        .group/code pre span.hljs-string,
        .group/code pre span.hljs-number,
        .group/code pre span.hljs-comment,
        .group/code pre span.hljs-function,
        .group/code pre span.hljs-class,
        .group/code pre span.hljs-title,
        .group/code pre span.hljs-attr,
        .group/code pre span.hljs-value,
        .group/code pre span.hljs-tag,
        .group/code pre span.hljs-name,
        .group/code pre span.hljs-built_in,
        .group/code pre span.hljs-literal,
        .group/code pre span.hljs-bullet,
        .group/code pre span.hljs-code,
        .group/code pre span.hljs-addition,
        .group/code pre span.hljs-deletion,
        .group/code pre span.hljs-meta,
        .group/code pre span.hljs-regexp,
        .group/code pre span.hljs-symbol,
        .group/code pre span.hljs-variable,
        .group/code pre span.hljs-params,
        .group/code pre span.hljs-property,
        .group/code pre span.hljs-selector,
        .group/code pre span.hljs-quote,
        .group/code pre span.hljs-template-tag,
        .group/code pre span.hljs-template-variable,
        .group/code pre span.hljs-type,
        .group/code pre span.hljs-section,
        .group/code pre span.hljs-attribute,
        .group/code pre span.hljs-link,
        .group/code pre span.hljs-emphasis,
        .group/code pre span.hljs-strong,
        .group/code pre span.hljs-formula,
        .group/code pre code,
        .group/code pre code span {
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
          white-space: pre-wrap !important;
        }
      `}</style>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  const el = node as { props?: { children?: React.ReactNode } };
  if (el.props) return extractText(el.props.children);
  return "";
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="prism-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children as React.ReactNode}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
