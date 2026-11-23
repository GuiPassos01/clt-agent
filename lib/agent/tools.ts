import { z } from "zod";

import { calcularAvisoPrevio, MOTIVOS } from "../calc/aviso-previo";
import { calcularDecimoTerceiro } from "../calc/decimo-terceiro";
import { calcularFerias } from "../calc/ferias";
import type { KnowledgeBase } from "../knowledge/rag-kit";
import type { FunctionDeclaration } from "../llm/types";

export interface ToolContext {
  knowledge: KnowledgeBase;
  signal?: AbortSignal;
}

export interface Tool {
  declaration: FunctionDeclaration;
  run(args: unknown, context: ToolContext): Promise<object>;
}

const date = (description: string) =>
  z.string().describe(`${description}, no formato AAAA-MM-DD.`);
const count = (description: string) =>
  z.number().int().min(0).describe(description);
const dataAdmissao = date("Data de admissão");
const dataFim = date(
  "Último dia do contrato, já somando o aviso prévio indenizado (dataProjetada)",
);
const salario = z
  .number()
  .positive()
  .describe("Salário mensal bruto em reais, ex.: 3500.5.");

function defineTool<TSchema extends z.ZodObject>(
  name: string,
  description: string,
  schema: TSchema,
  run: (
    args: z.infer<TSchema>,
    context: ToolContext,
  ) => Promise<object> | object,
): Tool {
  return {
    declaration: {
      name,
      description,
      parametersJsonSchema: z.toJSONSchema(schema),
    },
    async run(args, context) {
      const parsed = schema.safeParse(args);
      if (!parsed.success)
        return {
          erro: `Argumentos inválidos: ${z.prettifyError(parsed.error)}`,
        };
      return run(parsed.data, context);
    },
  };
}

export const tools: Tool[] = [
  defineTool(
    "buscar_clt",
    "Busca trechos da CLT (Consolidação das Leis do Trabalho) relevantes para a pergunta. Devolve os trechos numerados com a fonte. Use antes de responder qualquer dúvida sobre a lei e cite os artigos que vierem nos trechos.",
    z.object({
      pergunta: z
        .string()
        .min(3)
        .describe(
          "O que procurar, com os termos que a lei usaria, ex.: 'férias proporcionais na dispensa por justa causa'.",
        ),
    }),
    async ({ pergunta }, { knowledge, signal }) => ({
      trechos: await knowledge.search(pergunta, signal),
    }),
  ),
  defineTool(
    "calcular_aviso_previo",
    "Calcula os dias e o valor do aviso prévio indenizado conforme o motivo do desligamento, e a data projetada de saída (que deve ser usada como dataFim nos cálculos de férias e 13º).",
    z.object({
      dataAdmissao,
      dataDesligamento: date("Data em que o aviso foi dado"),
      salario,
      motivo: z
        .enum(MOTIVOS)
        .describe(
          "Motivo do desligamento. 'acordo' é a rescisão por acordo do art. 484-A.",
        ),
    }),
    calcularAvisoPrevio,
  ),
  defineTool(
    "calcular_decimo_terceiro",
    "Calcula o 13º salário proporcional do ano do desligamento. Não se aplica à dispensa por justa causa.",
    z.object({ dataAdmissao, dataFim, salario }),
    calcularDecimoTerceiro,
  ),
  defineTool(
    "calcular_ferias",
    "Calcula férias proporcionais e vencidas, com o adicional de 1/3, considerando as faltas injustificadas.",
    z.object({
      dataAdmissao,
      dataFim,
      salario,
      faltasInjustificadas: count(
        "Faltas injustificadas no período aquisitivo em curso. 0 se o usuário disser que não houve.",
      ),
      periodosVencidos: count(
        "Períodos aquisitivos completos cujas férias ainda não foram tiradas. 0 se todas foram tiradas.",
      ),
    }),
    calcularFerias,
  ),
];
