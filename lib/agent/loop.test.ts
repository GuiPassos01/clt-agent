import { describe, expect, test } from "bun:test";

import type { KnowledgeBase } from "../knowledge/rag-kit";
import type { Content, GenerateRequest, Llm } from "../llm/types";
import { AgentError, runAgent, type AgentEvent } from "./loop";
import { tools } from "./tools";

/** LLM roteirizado: devolve as mensagens na ordem e guarda o que recebeu. */
class ScriptedLlm implements Llm {
  readonly model = "roteiro";
  readonly requests: Content[][] = [];

  constructor(private readonly script: Content[]) {}

  async generate({ contents }: GenerateRequest): Promise<Content> {
    this.requests.push(structuredClone(contents));
    const next = this.script[this.requests.length - 1];
    if (!next) throw new Error("roteiro acabou");
    return next;
  }
}

const knowledge: KnowledgeBase = {
  async search(question) {
    return `[1] (fonte: clt.md · Art. 130)\nTrecho sobre ${question}`;
  },
};

const user = (text: string): Content => ({ role: "user", parts: [{ text }] });
const call = (
  name: string,
  args: Record<string, unknown>,
  id = "c1",
): Content => ({
  role: "model",
  parts: [{ functionCall: { id, name, args }, thoughtSignature: "assinatura" }],
});
const answer = (text: string): Content => ({
  role: "model",
  parts: [{ text }],
});

function run(llm: Llm, maxSteps?: number) {
  const events: AgentEvent[] = [];
  const result = runAgent({
    llm,
    knowledge,
    tools,
    system: "teste",
    contents: [user("pergunta")],
    onEvent: (event) => events.push(event),
    ...(maxSteps && { maxSteps }),
  });
  return { result, events };
}

describe("runAgent", () => {
  test("executa a ferramenta e devolve o resultado com id e assinatura", async () => {
    const llm = new ScriptedLlm([
      call("calcular_aviso_previo", {
        dataAdmissao: "2020-01-10",
        dataDesligamento: "2024-05-03",
        salario: 3000,
        motivo: "sem_justa_causa",
      }),
      answer("São 42 dias."),
    ]);
    const { result, events } = run(llm);

    expect(await result).toBe("São 42 dias.");
    expect(events.map((event) => event.type)).toEqual([
      "tool_call",
      "tool_result",
    ]);

    const second = llm.requests[1]!;
    expect(second[1]?.parts[0]?.thoughtSignature).toBe("assinatura");
    const response = second[2]?.parts[0]?.functionResponse;
    expect(response).toMatchObject({
      id: "c1",
      name: "calcular_aviso_previo",
      response: { dias: 42 },
    });
  });

  test("busca na base pelo rag-kit", async () => {
    const llm = new ScriptedLlm([
      call("buscar_clt", { pergunta: "faltas e férias" }),
      answer("Art. 130."),
    ]);
    const { result, events } = run(llm);
    await result;
    expect(events[1]).toMatchObject({
      type: "tool_result",
      isError: false,
      result: { trechos: expect.stringContaining("faltas e férias") },
    });
  });

  test("erro de cálculo volta para o modelo em vez de quebrar o loop", async () => {
    const llm = new ScriptedLlm([
      call("calcular_decimo_terceiro", {
        dataAdmissao: "2024-02-30",
        dataFim: "2024-06-01",
        salario: 3000,
      }),
      answer("A data de admissão é inválida, pode confirmar?"),
    ]);
    const { result, events } = run(llm);
    await result;
    expect(events[1]).toMatchObject({
      type: "tool_result",
      isError: true,
      result: { erro: "dataAdmissao não é uma data válida." },
    });
  });

  test("argumentos fora do schema e ferramenta desconhecida também voltam como erro", async () => {
    const llm = new ScriptedLlm([
      call("calcular_ferias", { salario: -1 }),
      call("apagar_banco", {}, "c2"),
      answer("ok"),
    ]);
    const { result, events } = run(llm);
    await result;
    const results = events.filter((event) => event.type === "tool_result");
    expect(results.map((event) => event.isError)).toEqual([true, true]);
  });

  test("para no limite de passos", async () => {
    const llm = new ScriptedLlm(
      Array.from({ length: 5 }, () =>
        call("buscar_clt", { pergunta: "de novo" }),
      ),
    );
    await expect(run(llm, 3).result).rejects.toThrow(AgentError);
  });
});
