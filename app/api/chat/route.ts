import { AgentError, runAgent } from "@/lib/agent/loop";
import { systemPrompt } from "@/lib/agent/prompt";
import { tools } from "@/lib/agent/tools";
import { chatRequestSchema, toContents, type ChatEvent } from "@/lib/chat";
import { createAgentDeps } from "@/lib/config";
import { LlmError } from "@/lib/llm/gemini";
import { describeError, notifyN8n } from "@/lib/notify";

function errorMessage(error: unknown): string {
  if (error instanceof AgentError || error instanceof LlmError)
    return error.message;
  console.error("Erro inesperado no agente:", error);
  return "Erro interno.";
}

/** Responde em SSE: cada passo do agente vira um evento, para a página mostrar o loop acontecendo. */
export async function POST(request: Request): Promise<Response> {
  const parsed = chatRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json({ error: "Requisição inválida." }, { status: 400 });

  const deps = createAgentDeps();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Se o cliente desconectou, o stream já foi cancelado e escrever nele lança erro.
      const send = (event: ChatEvent) => {
        if (!request.signal.aborted)
          controller.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
      };
      try {
        const answer = await runAgent({
          ...deps,
          tools,
          system: systemPrompt(new Date().toISOString().slice(0, 10)),
          contents: toContents(parsed.data.messages),
          signal: request.signal,
          onEvent: send,
        });
        send({ type: "done", answer });
        void notifyN8n({
          status: "done",
          message: answer,
          detail: parsed.data.messages.at(-1)!.text,
        });
      } catch (error) {
        // Desconexão do cliente não é erro: sem a checagem, errorMessage logaria o AbortError.
        if (!request.signal.aborted) {
          const message = errorMessage(error);
          send({ type: "error", message });
          void notifyN8n({
            status: "error",
            message,
            detail: describeError(error),
          });
        }
      } finally {
        if (!request.signal.aborted) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
