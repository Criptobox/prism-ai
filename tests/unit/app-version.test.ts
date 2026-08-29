import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { APP_VERSION, compareSemver, packageVersion, versionCheck } from "../../src/lib/prism/app-version";
import { pickManualModel, AUTO_MODEL_KEY } from "../../src/lib/prism/types";

describe("APP_VERSION", () => {
  it("coincide con package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe("compareSemver", () => {
  it("ordena 3.4.0 < 3.5.0 < 3.10.0", () => {
    expect(compareSemver("3.4.0", "3.5.0")).toBe(-1);
    expect(compareSemver("3.10.0", "3.4.0")).toBe(1);
    expect(compareSemver("3.4.0", "3.4.0")).toBe(0);
  });
});

describe("versionCheck", () => {
  it("al día si local >= latest", () => {
    expect(versionCheck("3.4.0", "3.4.0")).toBe("ok");
    expect(versionCheck("3.5.0", "3.4.0")).toBe("ok");
    expect(versionCheck("3.4.0", "3.4.1")).toBe("outdated");
    expect(versionCheck("3.4.0", null)).toBe("unknown");
  });
});

describe("packageVersion", () => {
  it("lee el campo version de un package.json (texto crudo)", () => {
    expect(packageVersion('{"name":"prism-ai","version":"3.4.0"}')).toBe("3.4.0");
  });
  it("acepta el objeto ya parseado", () => {
    expect(packageVersion({ version: "3.4.1" })).toBe("3.4.1");
  });
  it("devuelve el string tal cual (la ruta quita la «v» de las etiquetas de release)", () => {
    expect(packageVersion({ version: "v3.4.0" })).toBe("v3.4.0");
    expect(packageVersion("")).toBeNull();
    expect(packageVersion("no-json")).toBeNull();
    expect(packageVersion({})).toBeNull();
  });
});

describe("pickManualModel", () => {
  it("apaga Auto aunque no haya modelos: devuelve null, no Auto", () => {
    expect(pickManualModel(AUTO_MODEL_KEY, null, undefined)).toBeNull();
  });
  it("prioriza el último modelo a mano", () => {
    expect(pickManualModel(AUTO_MODEL_KEY, "kimi::kimi-k3", "groq::llama")).toBe("kimi::kimi-k3");
  });
});
