import { RagKitKnowledgeBase } from "./knowledge/rag-kit";
import { GeminiLlm } from "./llm/gemini";

function read(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (value === undefined)
    throw new Error(
      `Variável de ambiente ${name} é obrigatória (veja o .env.example).`,
    );
  return value;
}

export function createAgentDeps() {
  return {
    llm: new GeminiLlm({
      apiKey: read("GEMINI_API_KEY"),
      model: read("GEMINI_MODEL", "gemini-3.8-flash"),
    }),
    knowledge: new RagKitKnowledgeBase({
      url: read("RAG_KIT_MCP_URL", "http://127.0.0.1:3001/mcp"),
      collection: read("RAG_KIT_COLLECTION", "clt"),
    }),
  };
}
