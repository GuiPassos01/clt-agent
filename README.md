# clt-agent

Agente de IA que tira dúvidas sobre a CLT e faz cálculos trabalhistas, feito para estudar o loop de um agente escrito à mão. A base de conhecimento é o [rag-kit](https://github.com/GuiPassos01/rag-kit), consumido via MCP.

- **Loop à mão** (`lib/agent/loop.ts`): chama o LLM, executa as ferramentas pedidas, devolve os resultados e repete até vir só texto, com limite de passos
- **O LLM não faz conta**: cálculos são funções puras e testadas (`lib/calc/`); o modelo só extrai os dados, chama a ferramenta e explica
- **Cliente MCP**: a busca na CLT é a tool `search` do rag-kit, via Streamable HTTP
- **Passos visíveis**: a rota responde em SSE e a página mostra cada chamada de ferramenta e o resultado

## Ferramentas

| Tool | O que faz |
|---|---|
| `buscar_clt` | Busca trechos da CLT no rag-kit |
| `calcular_aviso_previo` | Dias e valor do aviso indenizado por motivo (sem justa causa, pedido, justa causa, acordo do art. 484-A) e a data projetada |
| `calcular_decimo_terceiro` | 13º proporcional do ano (fração de 15 dias conta como mês) |
| `calcular_ferias` | Férias proporcionais e vencidas com 1/3, com a redução por faltas do art. 130 |

Fora do MVP: saldo de salário, FGTS e multa, INSS e IRRF, férias em dobro (art. 137) e convenções coletivas.

## Como rodar

Pré-requisitos: Bun 1.3+, o rag-kit com a coleção `clt` indexada e uma chave do Gemini.

```bash
# no rag-kit
bun run db:up
bun run rag ingest clt
bun run mcp:http              # MCP em http://127.0.0.1:3001/mcp

# aqui
bun install
cp .env.example .env          # preencha GEMINI_API_KEY
bun dev                       # http://localhost:3000
```

## Estrutura

```
app/api/chat/route.ts   rota POST em SSE: tool_call, tool_result, text, done, error
app/page.tsx            chat com os passos do agente
lib/agent/              loop, ferramentas (schemas zod → JSON Schema) e prompt de sistema
lib/calc/               cálculos trabalhistas, sem dependência de LLM
lib/knowledge/          cliente MCP do rag-kit
lib/llm/                Gemini via fetch, com function calling
```

## Verificação

```bash
bun run typecheck
bun run lint
bun test
```

Orientação geral para estudo: não substitui um advogado ou contador.
