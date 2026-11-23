import { afterEach, describe, expect, test } from "bun:test";

import { GeminiLlm, LlmError } from "./gemini";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Troca o fetch global por respostas em sequência e conta as chamadas. */
function mockFetch(...responses: Array<() => Response | Promise<Response>>) {
  const calls: RequestInit[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    const next = responses[calls.length - 1];
    if (!next) throw new Error("fetch chamado mais vezes que o esperado");
    return next();
  }) as typeof fetch;
  return calls;
}

const ok = () =>
  Response.json({
    candidates: [{ content: { role: "model", parts: [{ text: "oi" }] } }],
  });

const llm = (
  options: Partial<ConstructorParameters<typeof GeminiLlm>[0]> = {},
) => new GeminiLlm({ apiKey: "chave", model: "gemini-teste", ...options });

const request = { system: "s", contents: [], tools: [] };

describe("GeminiLlm", () => {
  test("503 falha na hora, sem retry, sugerindo trocar o modelo", async () => {
    const calls = mockFetch(() => new Response("high demand", { status: 503 }));
    const error = await llm()
      .generate(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).message).toContain("GEMINI_MODEL");
    expect(calls).toHaveLength(1);
  });

  test("429 tenta de novo e devolve a mensagem do modelo", async () => {
    const calls = mockFetch(
      () => new Response("rate limit", { status: 429 }),
      ok,
    );
    const content = await llm({ retries: 1 }).generate(request);
    expect(content.parts[0]?.text).toBe("oi");
    expect(calls).toHaveLength(2);
  });

  test("400 não tem retry", async () => {
    const calls = mockFetch(() => new Response("bad", { status: 400 }));
    await expect(llm().generate(request)).rejects.toThrow(
      "Gemini respondeu 400",
    );
    expect(calls).toHaveLength(1);
  });

  test("timeout vira LlmError com o tempo", async () => {
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        ),
      )) as typeof fetch;
    await expect(llm({ timeoutMs: 20 }).generate(request)).rejects.toThrow(
      "O Gemini não respondeu em 0.02s.",
    );
  });
});
