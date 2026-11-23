/** Formato de conversa do Gemini, usado direto no loop: sem camada de tradução. */
export interface FunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface FunctionResponse {
  id?: string;
  name: string;
  response: object;
}

/**
 * Uma parte da mensagem. `thoughtSignature` vem junto das chamadas de função
 * no Gemini 3 e precisa voltar intacta na próxima requisição.
 */
export interface Part {
  text?: string;
  thought?: boolean;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  thoughtSignature?: string;
}

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface GenerateRequest {
  system: string;
  contents: Content[];
  tools: FunctionDeclaration[];
  signal?: AbortSignal;
}

export interface Llm {
  model: string;
  /** Devolve a mensagem do modelo: texto, chamadas de função ou os dois. */
  generate(request: GenerateRequest): Promise<Content>;
}
