export type NotifyPayload =
  | {
      status: "done";
      /** A resposta do agente (markdown). */
      message: string;
      /** A pergunta do usuário que gerou a resposta. */
      detail: string;
    }
  | {
      status: "error";
      /** O que apareceu para o usuário na tela. */
      message: string;
      /** O erro original, para saber o que rolou de fato (ex.: "Erro interno." esconde a causa). */
      detail: string;
    };

const TIMEOUT_MS = 5_000;

export function describeError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

/**
 * Avisa o webhook do n8n que o agente terminou (com resposta ou erro), via POST JSON.
 * Sem N8N_WEBHOOK_URL/N8N_NOTIFY_EMAIL não faz nada; falha só vai para o log, nunca derruba o chat.
 */
export async function notifyN8n(
  payload: NotifyPayload,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const url = env.N8N_WEBHOOK_URL?.trim();
  const email = env.N8N_NOTIFY_EMAIL?.trim();
  if (!url || !email) return;
  const apiKey = env.N8N_WEBHOOK_API_KEY?.trim();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey && { "api-key": apiKey }),
      },
      body: JSON.stringify({ email, ...payload }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok)
      console.error(`Webhook do n8n respondeu ${response.status}.`);
  } catch (error) {
    console.error("Falha ao chamar o webhook do n8n:", error);
  }
}
