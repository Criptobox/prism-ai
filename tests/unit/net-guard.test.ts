import { describe, it, expect } from "vitest";
import {
  checkTarget,
  checkTargetSync,
  isBlockedHostname,
  isPrivateAddress,
  isPrivateIpv4,
  isPrivateIpv6,
  type Resolver,
} from "../../src/lib/prism/net-guard";

describe("isPrivateIpv4", () => {
  it("bloquea el rango de metadatos de la nube", () => {
    // el que devuelve credenciales IAM en AWS, GCP, Azure y DigitalOcean
    expect(isPrivateIpv4("169.254.169.254")).toBe(true);
    expect(isPrivateIpv4("169.254.0.1")).toBe(true);
  });

  it("bloquea bucle local, privadas y CGNAT", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.2.3",
      "0.0.0.0",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateIpv4(ip), ip).toBe(true);
    }
  });

  it("deja pasar las direcciones públicas de verdad", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "104.18.0.1", "172.32.0.1", "192.169.0.1", "11.0.0.1"]) {
      expect(isPrivateIpv4(ip), ip).toBe(false);
    }
  });

  it("no confunde 172.15 y 172.32 con el rango privado", () => {
    expect(isPrivateIpv4("172.15.0.1")).toBe(false);
    expect(isPrivateIpv4("172.32.0.1")).toBe(false);
  });
});

describe("isPrivateIpv6", () => {
  it("bloquea bucle local, únicas locales y link-local", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "ff02::1"]) {
      expect(isPrivateIpv6(ip), ip).toBe(true);
    }
  });

  it("bloquea una IPv4 privada disfrazada de IPv6", () => {
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:169.254.169.254")).toBe(true);
  });

  it("deja pasar las públicas", () => {
    expect(isPrivateIpv6("2606:4700::1111")).toBe(false);
    expect(isPrivateIpv6("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("elige la familia correcta sola", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("bloquea los nombres internos habituales", () => {
    for (const h of [
      "localhost",
      "LOCALHOST",
      "algo.localhost",
      "metadata.google.internal",
      "metadata",
      "instance-data",
      "servidor.internal",
      "impresora.local",
      "nas.lan",
    ]) {
      expect(isBlockedHostname(h), h).toBe(true);
    }
  });

  it("deja pasar los proveedores reales", () => {
    for (const h of [
      "api.openai.com",
      "generativelanguage.googleapis.com",
      "openrouter.ai",
      "api.anthropic.com",
      "aihubmix.com",
      "internal-tools.example.com", // «internal» en medio, no como sufijo
    ]) {
      expect(isBlockedHostname(h), h).toBe(false);
    }
  });
});

describe("checkTargetSync", () => {
  it("rechaza protocolos que no son http(s)", () => {
    for (const u of ["file:///etc/passwd", "gopher://x/", "ftp://x/"]) {
      const r = checkTargetSync(u);
      expect(r.blocked && r.reason, u).toBe("protocolo");
    }
  });

  it("rechaza una URL malformada", () => {
    const r = checkTargetSync("no-es-una-url");
    expect(r.blocked && r.reason).toBe("url-invalida");
  });

  it("rechaza las IP privadas escritas a mano", () => {
    const r = checkTargetSync("http://169.254.169.254/latest/meta-data/");
    expect(r.blocked && r.reason).toBe("ip-privada");
  });

  it("rechaza IPv6 de bucle local entre corchetes", () => {
    const r = checkTargetSync("http://[::1]:8080/");
    expect(r.blocked && r.reason).toBe("ip-privada");
  });

  it("rechaza localhost por nombre", () => {
    expect(checkTargetSync("http://localhost:3000/").blocked).toBe(true);
    expect(checkTargetSync("http://127.0.0.1:9911/").blocked).toBe(true);
  });

  it("deja pasar un proveedor con IP pública literal", () => {
    expect(checkTargetSync("https://8.8.8.8/v1/models").blocked).toBe(false);
  });
});

describe("checkTarget (con resolución de nombres)", () => {
  const resolverFijo = (mapa: Record<string, string[]>): Resolver => async (h) => {
    if (!(h in mapa)) throw new Error("NXDOMAIN");
    return mapa[h];
  };

  it("deja pasar un dominio que resuelve a IP pública", async () => {
    const r = await checkTarget(
      "https://api.openai.com/v1/chat",
      resolverFijo({ "api.openai.com": ["104.18.7.192"] })
    );
    expect(r.blocked).toBe(false);
  });

  it("bloquea un dominio propio que apunta a bucle local", async () => {
    // el caso que el filtro por nombre NO puede ver
    const r = await checkTarget(
      "https://malicioso.ejemplo.com/",
      resolverFijo({ "malicioso.ejemplo.com": ["127.0.0.1"] })
    );
    expect(r.blocked && r.reason).toBe("ip-privada");
    expect(r.blocked && r.detail).toContain("127.0.0.1");
  });

  it("basta UNA dirección mala entre varias para rechazar", async () => {
    const r = await checkTarget(
      "https://mixto.ejemplo.com/",
      resolverFijo({ "mixto.ejemplo.com": ["93.184.216.34", "169.254.169.254"] })
    );
    expect(r.blocked && r.reason).toBe("ip-privada");
  });

  it("rechaza si el nombre no resuelve", async () => {
    const r = await checkTarget("https://no-existe.ejemplo/", resolverFijo({}));
    expect(r.blocked && r.reason).toBe("sin-resolver");
  });

  it("rechaza si resuelve a una lista vacía", async () => {
    const r = await checkTarget("https://vacio.ejemplo/", resolverFijo({ "vacio.ejemplo": [] }));
    expect(r.blocked && r.reason).toBe("sin-resolver");
  });

  it("no consulta el DNS si el host ya es una IP", async () => {
    let consultas = 0;
    const contador: Resolver = async () => {
      consultas++;
      return ["8.8.8.8"];
    };
    await checkTarget("https://8.8.8.8/v1", contador);
    expect(consultas).toBe(0);
  });
});
