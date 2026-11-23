import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { describeError, notifyN8n } from "./notify";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(respond: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as typeof fetch;
  return calls;
}

const done = {
  status: "done",
  message: "30 dias",
  detail: "Quantos dias de férias?",
} as const;

const env = {
  N8N_WEBHOOK_URL: "https://n8n.exemplo/webhook/abc",
  N8N_NOTIFY_EMAIL: "eu@exemplo.com",
};

describe("notifyN8n", () => {
  test("em sucesso manda POST JSON com a resposta e a pergunta", async () => {
    const calls = mockFetch(() => new Response("ok"));
    await notifyN8n(done, env);
    expect(calls[0]!.url).toBe(env.N8N_WEBHOOK_URL);
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      email: "eu@exemplo.com",
      status: "done",
      message: "30 dias",
      detail: "Quantos dias de férias?",
    });
  });

  test("em erro manda a mensagem da tela e o detalhe", async () => {
    const calls = mockFetch(() => new Response("ok"));
    await notifyN8n(
      {
        status: "error",
        message: "Erro interno.",
        detail: describeError(new TypeError("x is undefined")),
      },
      env,
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      email: "eu@exemplo.com",
      status: "error",
      message: "Erro interno.",
      detail: "TypeError: x is undefined",
    });
  });

  test("manda o header api-key só quando configurado", async () => {
    const calls = mockFetch(() => new Response("ok"));
    await notifyN8n(done, { ...env, N8N_WEBHOOK_API_KEY: "segredo" });
    await notifyN8n(done, env);
    const header = (i: number) =>
      new Headers(calls[i]!.init.headers).get("api-key");
    expect(header(0)).toBe("segredo");
    expect(header(1)).toBeNull();
  });

  test("sem as variáveis de ambiente não chama nada", async () => {
    const calls = mockFetch(() => new Response("ok"));
    await notifyN8n(done, { N8N_WEBHOOK_URL: env.N8N_WEBHOOK_URL });
    await notifyN8n(done, { N8N_NOTIFY_EMAIL: env.N8N_NOTIFY_EMAIL });
    expect(calls).toHaveLength(0);
  });

  test("falha de rede ou status ruim só loga, não lança", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    mockFetch(() => new Response("nope", { status: 404 }));
    await notifyN8n(done, env);
    mockFetch(() => Promise.reject(new Error("offline")));
    await notifyN8n(done, env);
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
