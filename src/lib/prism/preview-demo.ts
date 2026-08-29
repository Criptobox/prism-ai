/** Prism AI — Página de ejemplo para enseñar la vista previa en vivo.
 * No llama a ningún modelo: el chat escribe el HTML a trozos. */

export const DEMO_PROMPT =
  "Crea una página de aterrizaje para una cafetería de especialidad, en un solo archivo HTML con diseño moderno y animaciones";

export const DEMO_TITLE = "Café Bruma";

const PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Café Bruma</title>
<style>
  :root { --ink:#1c1410; --cream:#f6efe4; --gold:#c9a36a; --paper:#fffaf3; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--ink); color: var(--cream); font-family: Palatino, "Palatino Linotype", Georgia, serif; }
  body { min-height: 100vh; }
  a { color: inherit; }
  nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.25rem 8vw; letter-spacing: .18em; font-size: 11px; text-transform: uppercase;
    border-bottom: 1px solid rgba(201,163,106,.25);
  }
  nav strong { font-size: 13px; letter-spacing: .28em; }
  nav span { opacity: .7; }
  .hero {
    min-height: 72vh; display: grid; place-items: center; text-align: center;
    padding: 12vh 8vw 8vh; background:
      radial-gradient(ellipse at 50% 0%, rgba(201,163,106,.22), transparent 55%),
      linear-gradient(180deg, #2a1d16, var(--ink));
  }
  .eyebrow { color: var(--gold); letter-spacing: .32em; font-size: 11px; text-transform: uppercase; }
  h1 { font-size: clamp(3rem, 9vw, 6.4rem); font-weight: 500; line-height: .9; margin: .4em 0 .35em; }
  h1 em { font-style: italic; color: var(--gold); }
  .hero p { max-width: 34rem; margin: 0 auto 2rem; opacity: .78; line-height: 1.65; font-size: 1.05rem; }
  .btn {
    display: inline-block; padding: .9rem 1.6rem; background: var(--gold); color: var(--ink);
    text-decoration: none; letter-spacing: .16em; font-size: 11px; text-transform: uppercase;
    border-radius: 999px;
  }
  .menu { background: var(--paper); color: var(--ink); padding: 5rem 8vw; }
  .menu h2 { font-size: 2rem; font-weight: 500; margin-bottom: 2rem; }
  .grid { display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  article {
    background: #fff; padding: 1.4rem; border-radius: 18px;
    box-shadow: 0 12px 40px rgba(28,20,16,.06);
  }
  article h3 { font-size: 1.25rem; margin-bottom: .35rem; }
  article p { font-size: .92rem; opacity: .7; line-height: 1.5; }
  article b { display: block; margin-top: .8rem; color: #8a6230; font-weight: 600; }
  footer { padding: 2rem 8vw; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; opacity: .55; }
</style>
</head>
<body>
  <nav>
    <strong>Bruma</strong>
    <span>Especialidad · Toronto</span>
  </nav>
  <header class="hero">
    <div>
      <p class="eyebrow">Tostado cada amanecer</p>
      <h1>El café,<br><em>despacio.</em></h1>
      <p>Granos de origen único, leche de avena tostada y un rincón en King West para quedarte más de lo que pensabas.</p>
      <a class="btn" href="#carta">Ver la carta</a>
    </div>
  </header>
  <section class="menu" id="carta">
    <h2>Hoy en barra</h2>
    <div class="grid">
      <article>
        <h3>Bruma latte</h3>
        <p>Espresso suave, vapor de avena y un hilo de miel de arce.</p>
        <b>6,50 CAD</b>
      </article>
      <article>
        <h3>Filtro Etiopía</h3>
        <p>Notas de jazmín y melocotón. V60, 200 ml.</p>
        <b>5,75 CAD</b>
      </article>
      <article>
        <h3>Chocolate caliente</h3>
        <p>Cacao 70 % y nata ligera. Para días grises.</p>
        <b>5,25 CAD</b>
      </article>
    </div>
  </section>
  <footer>King St W · Abierto 7:30–18:00 · Café Bruma</footer>
</body>
</html>`;

export function demoReply(): string {
  return (
    "Te dejo una landing para **Café Bruma**: hero, carta y un tono de tostadero. " +
    "Se va a pintar sola a la derecha mientras escribo.\n\n```html\n" +
    PAGE +
    "\n```"
  );
}

/** Escribe `full` en trozos para imitar el streaming de un modelo. */
export function typeDemoReply(
  full: string,
  onChunk: (soFar: string) => void,
  onDone: () => void
): () => void {
  let i = 0;
  let timer = 0;
  const step = () => {
    const remain = full.length - i;
    const n = remain > 1800 ? 90 : remain > 400 ? 55 : 28;
    i = Math.min(full.length, i + n);
    onChunk(full.slice(0, i));
    if (i < full.length) timer = window.setTimeout(step, 42);
    else onDone();
  };
  timer = window.setTimeout(step, 280);
  return () => window.clearTimeout(timer);
}
