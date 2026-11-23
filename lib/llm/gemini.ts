import type { Content, GenerateRequest, Llm } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE_STATUS = new Set([429, 500]);

export class LlmError extends Error {
  override name = "LlmError";
}

export interface GeminiLlmOptions {
  apiKey: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
  retries?: number;
}

interface GenerateResponse {
  candidates?: Array<{ content?: Content; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export class GeminiLlm implements Llm {
  readonly model: string;

  constructor(private readonly options: GeminiLlmOptions) {
    this.model = options.model;
  }

  async generate({
    system,
    contents,
    tools,
    signal,
  }: GenerateRequest): Promise<Content> {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: tools }],
      generationConfig: { temperature: this.options.temperature ?? 0.2 },
    });

    const retries = this.options.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      const response = await this.post(body, signal);
      if (response.ok)
        return this.readContent((await response.json()) as GenerateResponse);

      const detail = await response.text();
      // O 503 de "high demand" leva ~40s para voltar e costuma durar minutos:
      // insistir só prende o usuário. Falha na hora, com a saída indicada.
      if (response.status === 503) {
        throw new LlmError(
          `O modelo ${this.model} está sobrecarregado no Gemini (503). Tente de novo em instantes ou troque o GEMINI_MODEL (ex.: gemini-3.5-flash).`,
        );
      }
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= retries) {
        throw new LlmError(
          `Gemini respondeu ${response.status}: ${detail.slice(0, 300)}`,
        );
      }
      // 429 e 500 voltam rápido e costumam passar em segundos: backoff de 1s, 2s.
      await sleep(1_000 * 2 ** attempt, signal);
    }
  }

  private async post(body: string, signal?: AbortSignal): Promise<Response> {
    const timeoutMs = this.options.timeoutMs ?? 90_000;
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      return await fetch(`${BASE_URL}/${this.model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.options.apiKey,
        },
        body,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      if (timeout.aborted)
        throw new LlmError(`O Gemini não respondeu em ${timeoutMs / 1000}s.`);
      throw error;
    }
  }

  private readContent(data: GenerateResponse): Content {
    if (data.promptFeedback?.blockReason)
      throw new LlmError(
        `Pergunta bloqueada pelo Gemini (${data.promptFeedback.blockReason}).`,
      );
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      throw new LlmError(
        `Gemini não devolveu conteúdo (finishReason: ${candidate?.finishReason ?? "desconhecido"}).`,
      );
    }
    return { role: "model", parts: candidate.content.parts };
  }
}
