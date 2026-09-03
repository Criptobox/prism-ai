/** Prism AI — El escudo PII aplicado a una conversación.
 *
 * Los dos fallos que se arreglan aquí los vio el usuario con un «hola»:
 * el aviso decía «2 datos enmascarados… en lo que se envió» como si fueran
 * del mensaje que acababa de escribir, y lo que enmascaraba era un correo
 * dentro del HTML que había subido.
 */
import { describe, expect, it } from "vitest";
import { escudoHistorial, maskPII, type TurnoEscudo } from "../../src/lib/prism/pii";

const t = (role: string, content: string): TurnoEscudo => ({ role, content });

describe("escudoHistorial", () => {
  it("apagado no toca nada y no cuenta nada", () => {
    const msgs = [t("user", "escríbeme a ana@ejemplo.com")];
    const r = escudoHistorial(msgs, false);
    expect(r.contenidos[0]).toBe("escríbeme a ana@ejemplo.com");
    expect(r.total).toBe(0);
  });

  it("enmascara lo que escribió el usuario", () => {
    const r = escudoHistorial([t("user", "mi correo es ana@ejemplo.com")], true);
    expect(r.contenidos[0]).not.toContain("ana@ejemplo.com");
    expect(r.total).toBe(1);
    expect(r.tipos).toEqual(["email"]);
  });

  it("NO toca lo que respondió el modelo", () => {
    // Enmascararlo no protege nada —ya salió y volvió— y le rompe su propio
    // código en la siguiente vuelta.
    const original = "aquí tienes: contacto@tuweb.com";
    const r = escudoHistorial([t("assistant", original)], true);
    expect(r.contenidos[0]).toBe(original);
    expect(r.total).toBe(0);
  });

  it("dice que fue en ESTE mensaje cuando lo fue", () => {
    const r = escudoHistorial(
      [t("user", "hazme una web"), t("assistant", "ok"), t("user", "mándala a ana@ejemplo.com")],
      true
    );
    expect(r.enEsteMensaje).toBe(true);
  });

  it("dice que NO fue en este mensaje cuando viene de atrás", () => {
    // El caso del usuario: escribe «hola» y el aviso salta por un mensaje
    // de hace diez turnos. Antes daba a entender que era el de ahora.
    const r = escudoHistorial(
      [t("user", "mi correo es ana@ejemplo.com"), t("assistant", "ok"), t("user", "hola")],
      true
    );
    expect(r.total).toBe(1);
    expect(r.enEsteMensaje).toBe(false);
  });

  it("no repite tipos aunque haya varios del mismo", () => {
    const r = escudoHistorial([t("user", "ana@uno.com y luis@dos.com y eva@tres.com")], true);
    expect(r.total).toBe(3);
    expect(r.tipos).toEqual(["email"]);
  });

  it("respeta el código con vallas, que es donde vive el proyecto", () => {
    const conCodigo = "arregla esto:\n```html\n<a href=\"mailto:hola@tuweb.com\">Escríbenos</a>\n```";
    const r = escudoHistorial([t("user", conCodigo)], true);
    expect(r.contenidos[0]).toContain("hola@tuweb.com");
    expect(r.total).toBe(0);
  });

  it("los contenidos salen en el mismo orden y con la misma longitud", () => {
    const msgs = [t("user", "uno"), t("assistant", "dos"), t("user", "tres")];
    const r = escudoHistorial(msgs, true);
    expect(r.contenidos).toEqual(["uno", "dos", "tres"]);
  });
});

describe("maskPII sigue intacta", () => {
  it("el texto adjunto SIN vallas se enmascararía: por eso no se le pasa", () => {
    // Esta es la prueba de por qué el escudo se aplica ANTES de pegar los
    // adjuntos: si el HTML del archivo entrara por aquí, saldría roto.
    const html = '<a href="mailto:hola@tuweb.com">Escríbenos</a>';
    expect(maskPII(html).findings.length).toBe(1);
  });
});
