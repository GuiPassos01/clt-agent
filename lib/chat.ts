import { z } from "zod";

import type { AgentEvent } from "./agent/loop";
import type { Content } from "./llm/types";

/** Contrato entre a página e a rota /api/chat. */
export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().min(1).max(4_000),
      }),
    )
    .min(1)
    .max(40)
    .refine(
      (messages) => messages.at(-1)?.role === "user",
      "A última mensagem precisa ser do usuário.",
    ),
});

export type ChatMessage = z.infer<typeof chatRequestSchema>["messages"][number];

export type ChatEvent =
  | AgentEvent
  | { type: "done"; answer: string }
  | { type: "error"; message: string };

/** Só o texto das mensagens anteriores: as chamadas de ferramenta de turnos passados não voltam. */
export function toContents(messages: ChatMessage[]): Content[] {
  return messages.map((message) => ({
    role: message.role === "user" ? "user" : "model",
    parts: [{ text: message.text }],
  }));
}
