import { describe, expect, it } from "vitest";
import {
  buildTaskChain,
  classifyTask,
  lastUserPrompt,
  pickTaskFailover,
  scoreModel,
} from "../../src/lib/prism/task-router";

describe("classifyTask", () => {
  it("detecta una landing / página", () => {
    expect(classifyTask("Crea una página de aterrizaje para una cafetería").kind).toBe("web");
  });

  it("detecta código", () => {
    expect(classifyTask("Refactorea esta función en Python").kind).toBe("code");
  });

  it("detecta escritura", () => {
    expect(classifyTask("Redacta un correo profesional para mi jefe").kind).toBe("write");
  });

  it("un saludo es chat", () => {
    expect(classifyTask("Hola, qué tal").kind).toBe("chat");
  });

  it("detecta razonamiento y datos", () => {
    expect(classifyTask("Analiza paso a paso esta demostración matemática").kind).toBe("reason");
    expect(classifyTask("Haz un dashboard con estos datos CSV").kind).toBe("data");
  });
});

describe("lastUserPrompt", () => {
  it("ignora las instrucciones internas del agente", () => {
    expect(
      lastUserPrompt([
        { role: "user", content: "Crea una página" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "Continúa el trabajo", instruction: true },
      ])
    ).toBe("Crea una página");
  });
});

describe("buildTaskChain", () => {
  const providers = {
    nvidia: { apiKey: "k", enabled: true, models: ["moonshotai/kimi-k3", "meta/llama-3.3-70b-instruct"] },
    groq: { apiKey: "k", enabled: true, models: ["llama-3.1-8b-instant"] },
    gemini: { apiKey: "k", enabled: true, models: ["gemini-3.7-flash"] },
  };

  it("para una página prioriza Kimi K3 de NVIDIA frente a Groq instant", () => {
    const chain = buildTaskChain("web", providers);
    expect(chain[0]).toMatchObject({ providerId: "nvidia", modelId: "moonshotai/kimi-k3" });
    expect(chain.some((c) => c.providerId === "groq")).toBe(true);
  });

  it("para chat prioriza un modelo rápido (Groq) por encima de NIM", () => {
    const chain = buildTaskChain("chat", providers);
    expect(chain[0]?.providerId).toBe("groq");
  });

  it("si se agota NVIDIA, el failover de web no lo vuelve a elegir", () => {
    const next = pickTaskFailover("web", providers, "nvidia");
    expect(next?.providerId).not.toBe("nvidia");
    expect(next).toBeTruthy();
  });

  it("kimi-k3 puntúa más que llama en una tarea web", () => {
    expect(scoreModel("web", "nvidia", "moonshotai/kimi-k3")).toBeGreaterThan(
      scoreModel("web", "nvidia", "meta/llama-3.3-70b-instruct")
    );
  });
});
