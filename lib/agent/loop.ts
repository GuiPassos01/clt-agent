import { CalcError } from "../calc/errors";
import { KnowledgeBaseError, type KnowledgeBase } from "../knowledge/rag-kit";
import type {
  Content,
  FunctionCall,
  FunctionResponse,
  Llm,
  Part,
} from "../llm/types";
import type { Tool } from "./tools";

export type AgentEvent =
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: object; isError: boolean };

export class AgentError extends Error {
  override name = "AgentError";
}

export interface RunAgentOptions {
  llm: Llm;
  knowledge: KnowledgeBase;
  tools: Tool[];
  system: string;
  /** Conversa até aqui, terminando na mensagem do usuário. */
  contents: Content[];
  /** Cada passo é uma chamada ao LLM; evita loop infinito de ferramentas. */
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}

const DEFAULT_MAX_STEPS = 8;

function visibleText(parts: Part[]): string {
  return parts
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();
}

async function runTool(
  call: FunctionCall,
  tools: Map<string, Tool>,
  options: RunAgentOptions,
): Promise<{ result: object; isError: boolean }> {
  const tool = tools.get(call.name);
  if (!tool)
    return {
      result: { erro: `Ferramenta desconhecida: ${call.name}.` },
      isError: true,
    };
  try {
    const result = await tool.run(call.args ?? {}, {
      knowledge: options.knowledge,
      ...(options.signal && { signal: options.signal }),
    });
    return { result, isError: "erro" in result };
  } catch (error) {
    // Erros esperados voltam para o modelo, que pode corrigir os argumentos ou avisar o usuário.
    if (error instanceof CalcError || error instanceof KnowledgeBaseError)
      return { result: { erro: error.message }, isError: true };
    throw error;
  }
}

/**
 * O loop do agente: chama o LLM, executa as ferramentas que ele pedir, devolve
 * os resultados e repete até ele responder só com texto.
 */
export async function runAgent(options: RunAgentOptions): Promise<string> {
  const tools = new Map(
    options.tools.map((tool) => [tool.declaration.name, tool]),
  );
  const contents = [...options.contents];
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  for (let step = 0; step < maxSteps; step++) {
    const message = await options.llm.generate({
      system: options.system,
      contents,
      tools: options.tools.map((tool) => tool.declaration),
      ...(options.signal && { signal: options.signal }),
    });
    // A mensagem volta inteira para o histórico: as thoughtSignatures precisam ir junto.
    contents.push(message);

    const calls = message.parts.flatMap((part) =>
      part.functionCall ? [part.functionCall] : [],
    );
    if (calls.length === 0) {
      const text = visibleText(message.parts);
      if (!text) throw new AgentError("O modelo terminou sem resposta.");
      return text;
    }

    const responses: Part[] = [];
    for (const call of calls) {
      options.onEvent?.({
        type: "tool_call",
        name: call.name,
        args: call.args ?? {},
      });
      const { result, isError } = await runTool(call, tools, options);
      options.onEvent?.({
        type: "tool_result",
        name: call.name,
        result,
        isError,
      });
      const functionResponse: FunctionResponse = {
        name: call.name,
        response: result,
        ...(call.id && { id: call.id }),
      };
      responses.push({ functionResponse });
    }
    contents.push({ role: "user", parts: responses });
  }

  throw new AgentError(
    `O agente passou do limite de ${maxSteps} passos sem chegar a uma resposta.`,
  );
}
