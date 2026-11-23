import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface KnowledgeBase {
  /** Trechos relevantes, já formatados com a fonte de cada um. */
  search(question: string, signal?: AbortSignal): Promise<string>;
}

export class KnowledgeBaseError extends Error {
  override name = "KnowledgeBaseError";
}

export interface RagKitOptions {
  url: string;
  collection: string;
  topK?: number;
}

/**
 * Cliente MCP do rag-kit via Streamable HTTP. O servidor é sem sessão, então
 * cada busca abre e fecha a conexão: duas requisições locais, nada para reconectar.
 */
export class RagKitKnowledgeBase implements KnowledgeBase {
  constructor(private readonly options: RagKitOptions) {}

  async search(question: string, signal?: AbortSignal): Promise<string> {
    const client = new Client({ name: "clt-agent", version: "0.1.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(this.options.url)),
      );
      const result = await client.callTool(
        {
          name: "search",
          arguments: {
            collection: this.options.collection,
            question,
            topK: this.options.topK ?? 5,
          },
        },
        undefined,
        signal ? { signal } : undefined,
      );
      const text = (result.content as Array<{ type: string; text?: string }>)
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      if (result.isError) throw new KnowledgeBaseError(`rag-kit: ${text}`);
      return text;
    } catch (error) {
      if (error instanceof KnowledgeBaseError) throw error;
      throw new KnowledgeBaseError(
        `Não consegui falar com o rag-kit em ${this.options.url}. Ele está rodando (bun run mcp:http)?`,
        { cause: error },
      );
    } finally {
      await client.close();
    }
  }
}
