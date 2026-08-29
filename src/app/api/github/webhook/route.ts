/** Prism AI — Webhook inactivo que exige el manifiesto de GitHub App. */
export const runtime = "nodejs";

export async function POST() {
  return new Response("ok", { status: 200 });
}

export async function GET() {
  return new Response("ok", { status: 200 });
}
