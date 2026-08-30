import {  expect, test  } from "./fixtures";

/** Prism AI — Las rutas de servidor, atacadas de verdad.
 *
 * Estas comprobaciones no miran el camino feliz: repiten los dos ataques que
 * funcionaban antes de existir el escudo. Si alguien afloja el guardián, aquí
 * se cae el CI y no en el despliegue de alguien.
 *
 * Ataque 1 — SSRF: el proxy pedía cualquier URL que le dieras, incluidos los
 * metadatos de la nube (que devuelven credenciales de la instancia) y los
 * servicios de la red interna.
 * Ataque 2 — origen cruzado: cualquier web podía hacer peticiones a estas rutas.
 */

const DESTINOS_INTERNOS = [
  ["metadatos de la nube", "http://169.254.169.254/latest/meta-data/"],
  ["bucle local", "http://127.0.0.1:9911/"],
  ["localhost por nombre", "http://localhost:9911/"],
  ["IPv6 bucle local", "http://[::1]:9911/"],
  ["red privada", "http://10.0.0.1/"],
  ["red privada 192.168", "http://192.168.1.1/admin"],
  ["nombre interno de Google", "http://metadata.google.internal/computeMetadata/v1/"],
];

test.describe("proxy — no se le puede usar contra la red interna", () => {
  for (const [nombre, url] of DESTINOS_INTERNOS) {
    test(`bloquea ${nombre} por POST`, async ({ request }) => {
      const res = await request.post("/api/proxy", {
        headers: { "x-target-url": url, "content-type": "application/json" },
        data: {},
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(403);
      expect(await res.text()).toContain("Destino no permitido");
    });

    test(`bloquea ${nombre} por GET`, async ({ request }) => {
      const res = await request.get("/api/proxy", {
        headers: { "x-target-url": url },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(403);
    });
  }

  test("bloquea protocolos que no son http(s)", async ({ request }) => {
    for (const url of ["file:///etc/passwd", "gopher://x/", "ftp://ejemplo.com/"]) {
      const res = await request.get("/api/proxy", {
        headers: { "x-target-url": url },
        failOnStatusCode: false,
      });
      expect(res.status(), url).toBe(403);
    }
  });

  test("sigue pidiendo un destino", async ({ request }) => {
    const res = await request.get("/api/proxy", { failOnStatusCode: false });
    expect(res.status()).toBe(400);
  });
});

test.describe("origen cruzado — ninguna ruta acepta peticiones de otra web", () => {
  const OTRA_WEB = { Origin: "https://malicioso.example" };

  test("el proxy lo rechaza", async ({ request }) => {
    const res = await request.get("/api/proxy", {
      headers: { ...OTRA_WEB, "x-target-url": "https://api.github.com/" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
    expect(await res.text()).toContain("Origen no permitido");
  });

  test("Repo Studio lo rechaza", async ({ request }) => {
    const res = await request.post("/api/repos", {
      headers: OTRA_WEB,
      data: { action: "list", repoKey: "cualquiera" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test("el radar de modelos lo rechaza", async ({ request }) => {
    const res = await request.get("/api/free-radar", {
      headers: OTRA_WEB,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("el uso legítimo sigue pasando", () => {
  test("un destino público atraviesa el proxy y devuelve lo del servidor remoto", async ({
    request,
  }) => {
    const res = await request.get("/api/proxy", {
      headers: { "x-target-url": "https://api.github.com/" },
      failOnStatusCode: false,
    });
    // Lo que importa es que NO lo para el escudo: el cuerpo viene de GitHub,
    // sea 200 o su mensaje de límite de tasa. Un bloqueo nuestro diría
    // «Destino no permitido».
    expect(await res.text()).not.toContain("Destino no permitido");
  });

  test("Repo Studio funciona desde la propia app", async ({ request, baseURL }) => {
    const res = await request.post("/api/repos", {
      headers: { Origin: baseURL ?? "http://localhost:3000" },
      data: { action: "list", repoKey: "no-existe-este-repo" },
      failOnStatusCode: false,
    });
    // Dos respuestas correctas, según contra qué servidor corra la suite:
    //   404 (desarrollo) → pasó el guardián y el repo sencillamente no está
    //   503 (producción sin PRISM_ACCESS_CODE) → la ruta está apagada a propósito
    // Lo que NO puede pasar es un 403 de origen cruzado: la petición viene de la
    // propia app. Ni, por supuesto, una respuesta con contenido.
    expect([404, 503]).toContain(res.status());
  });
});
