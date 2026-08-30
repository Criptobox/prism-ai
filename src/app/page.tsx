import { ChatApp } from "@/components/prism/chat-app";

/** Prism AI — Página principal.
 *
 * El handler POST del Share Target vive en `src/app/share/route.ts`
 * (ruta aparte, `/share`) para no chocar con el client component de
 * la página. El manifest referencia esa ruta como `action` del
 * `share_target`.
 */

export default function Home() {
  return <ChatApp />;
}

