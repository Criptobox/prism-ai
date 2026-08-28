"use client";
/** Prism AI — Renderizado de markdown con código resaltado */
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
    <div className="group/code my-3 overflow-hidden rounded-xl border border-border/70 bg-[#0B0E17] text-[#E6E9F2] shadow-sm">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-white/50">{lang}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/55 transition hover:bg-white/10 hover:text-white"
          aria-label="Copiar código"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

interface CodeProps {
  className?: string;
  children?: React.ReactNode;
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
