"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatEvent, ChatMessage } from "@/lib/chat";

/** Uma chamada de ferramenta; `result` chega depois, no evento tool_result. */
interface Step {
  name: string;
  args: Record<string, unknown>;
  result?: object;
  isError?: boolean;
}

interface Turn {
  question: string;
  steps: Step[];
  answer?: string;
  error?: string;
}

type AnsweredTurn = Turn & { answer: string };

const TOOL_LABELS: Record<string, string> = {
  buscar_clt: "Busca na CLT",
  calcular_aviso_previo: "Aviso prévio",
  calcular_decimo_terceiro: "13º salário",
  calcular_ferias: "Férias",
};

const EXAMPLES = [
  "Quantos dias de férias perde quem teve 10 faltas injustificadas?",
  "Como funciona o aviso prévio proporcional?",
  "Admitido em 10/01/2020, salário de R$ 3.000, demitido sem justa causa em 03/05/2024, sem faltas e com as férias em dia. Quanto recebe de aviso, férias e 13º?",
];

/** Lê o corpo SSE da rota e entrega cada evento já parseado. */
async function* readEvents(response: Response): AsyncIterable<ChatEvent> {
  const reader = response
    .body!.pipeThrough(new TextDecoderStream())
    .getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const data = buffer
        .slice(0, end)
        .split("\n")
        .find((line) => line.startsWith("data: "));
      buffer = buffer.slice(end + 2);
      if (data) yield JSON.parse(data.slice(6)) as ChatEvent;
    }
  }
}

function history(turns: AnsweredTurn[]): ChatMessage[] {
  return turns.flatMap((turn): ChatMessage[] => [
    { role: "user", text: turn.question },
    { role: "assistant", text: turn.answer },
  ]);
}

function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-3 text-[15px]">
      {children}
    </div>
  );
}

function StepChip({ step }: { step: Step }) {
  const label = TOOL_LABELS[step.name] ?? step.name;
  const status =
    step.result === undefined
      ? "text-zinc-400"
      : step.isError
        ? "text-red-500"
        : "text-indigo-500";
  const icon = step.result === undefined ? "…" : step.isError ? "!" : "✓";
  const detail =
    step.result && "trechos" in step.result
      ? String(step.result.trechos)
      : JSON.stringify(step.result ?? step.args, null, 2);

  return (
    <details className="group text-xs">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-zinc-600 hover:border-zinc-300">
        <span className={`font-semibold ${status}`}>{icon}</span>
        {label}
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-[11px] leading-relaxed text-zinc-500 ring-1 ring-zinc-200">
        {detail}
      </pre>
    </details>
  );
}

/** A parte interativa da página: estado da conversa, streaming e formulário. */
export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const updateLast = (update: (turn: Turn) => Turn) =>
    setTurns((current) => [...current.slice(0, -1), update(current.at(-1)!)]);

  function applyEvent(event: ChatEvent) {
    switch (event.type) {
      case "tool_call":
        return updateLast((turn) => ({
          ...turn,
          steps: [...turn.steps, { name: event.name, args: event.args }],
        }));
      case "tool_result":
        // As ferramentas rodam em sequência: o resultado é sempre do último passo.
        return updateLast((turn) => ({
          ...turn,
          steps: [
            ...turn.steps.slice(0, -1),
            {
              ...turn.steps.at(-1)!,
              result: event.result,
              isError: event.isError,
            },
          ],
        }));
      case "done":
        return updateLast((turn) => ({ ...turn, answer: event.answer }));
      case "error":
        return updateLast((turn) => ({ ...turn, error: event.message }));
    }
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || loading) return;

    // Turnos que falharam não entram no histórico enviado ao modelo.
    const previous = turns.filter(
      (turn): turn is AnsweredTurn => turn.answer !== undefined,
    );
    setTurns([...previous, { question: text, steps: [] }]);
    setInput("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [...history(previous), { role: "user", text }],
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`A API respondeu ${response.status}.`);
      for await (const event of readEvents(response)) applyEvent(event);
    } catch (error) {
      const message = controller.signal.aborted
        ? "Interrompido."
        : error instanceof Error
          ? error.message
          : "Falha na conexão.";
      updateLast((turn) => ({ ...turn, error: message }));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(input);
    }
  }

  return (
    <>
      <section className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
        <AssistantBubble>
          Olá! Tiro dúvidas sobre a CLT e calculo aviso prévio, férias e 13º.
          Você pode perguntar, por exemplo:
        </AssistantBubble>

        {turns.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => void ask(example)}
                className="rounded-xl bg-zinc-50 p-4 text-left text-xs font-medium leading-relaxed text-zinc-600 ring-1 ring-zinc-200/70 transition hover:bg-indigo-50/60 hover:ring-indigo-200"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {turns.map((turn, index) => (
          <article key={index} className="flex flex-col gap-3">
            <p className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-indigo-50 px-4 py-3 text-[15px]">
              {turn.question}
            </p>

            {turn.steps.length > 0 && (
              <div className="flex flex-wrap items-start gap-2">
                {turn.steps.map((step, i) => (
                  <StepChip key={i} step={step} />
                ))}
              </div>
            )}

            {turn.answer && (
              <AssistantBubble>
                <div className="markdown">
                  <Markdown remarkPlugins={[remarkGfm]}>{turn.answer}</Markdown>
                </div>
              </AssistantBubble>
            )}
            {turn.error && (
              <p className="self-start rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
                {turn.error}
              </p>
            )}
            {!turn.answer && !turn.error && (
              <AssistantBubble>
                <span className="inline-flex gap-1" aria-label="Pensando">
                  <span className="size-1.5 animate-bounce rounded-full bg-zinc-400" />
                  <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
                </span>
              </AssistantBubble>
            )}
          </article>
        ))}
        <div ref={endRef} />
      </section>

      <form
        onSubmit={onSubmit}
        className="m-4 mt-0 flex items-end gap-2 rounded-xl border border-zinc-200 bg-white p-2 focus-within:border-indigo-300"
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder="Pergunte sobre a CLT ou peça um cálculo…"
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-zinc-400"
        />
        {loading ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Parar
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="h-10 rounded-lg bg-indigo-500 px-5 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-40"
          >
            Perguntar
          </button>
        )}
      </form>
    </>
  );
}
