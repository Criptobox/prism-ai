import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { APP_VERSION, compareSemver, versionCheck } from "../../src/lib/prism/app-version";
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

describe("pickManualModel", () => {
  it("apaga Auto aunque no haya modelos: devuelve null, no Auto", () => {
    expect(pickManualModel(AUTO_MODEL_KEY, null, undefined)).toBeNull();
  });
  it("prioriza el último modelo a mano", () => {
    expect(pickManualModel(AUTO_MODEL_KEY, "kimi::kimi-k3", "groq::llama")).toBe("kimi::kimi-k3");
  });
});
