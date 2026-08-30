import { NextRequest, NextResponse } from "next/server";

/** Prism AI — Share Target handler (PLAN-V4 punto 4).
 *
 * Vive en `/share` (ruta aparte) para no chocar con el client
 * component de la página principal (`/`). El manifest referencia
 * esta ruta como `action` del `share_target`.
 *
 * Cuando una app externa comparte texto con Prism (PWA instalada), el
 * navegador POSTea aquí un `multipart/form-data`. Se extrae el
 * texto/título/URL y se redirige a `/?shared=1` con el contenido en
 * una cookie efímera de un solo uso. El `chat-app` lee la cookie en
 * mount y la vuelca en el input del chat.
 *
 * Por qué cookie y no query param: el texto compartido puede ser
 * largo (un artículo entero) y la URL tiene un tope práctico de ~2 KB.
 * La cookie soporta hasta 4 KB y se borra al leerse. Las imágenes
 * (binarios) se dejan para iteración posterior — el plan tasa el
 * Share Target en «un par de días» y el texto es lo más común.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const title = String(form.get("title") ?? "");
    const text = String(form.get("text") ?? "");
    const url = String(form.get("url") ?? "");

    const partes: string[] = [];
    if (title) partes.push(title);
    if (text && text !== title) partes.push(text);
    if (url && url !== text) partes.push(url);
    const contenido = partes.join("\n\n").slice(0, 3500);

    if (!contenido) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const res = NextResponse.redirect(new URL("/?shared=1", req.url));
    res.cookies.set("prism-share", contenido, {
      path: "/",
      sameSite: "lax",
      maxAge: 60,
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/", req.url));
  }
}

// GET /share → 404: no es una página, solo un endpoint POST.
export function GET() {
  return new Response("Not Found", { status: 404 });
}
