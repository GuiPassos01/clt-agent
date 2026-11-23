import { daysBetween, parsePeriod } from "./dates";
import { assertSalary, roundCents } from "./money";

export interface DecimoTerceiroInput {
  dataAdmissao: string;
  /** Último dia trabalhado, já com a projeção do aviso indenizado, se houver. */
  dataFim: string;
  salario: number;
}

export interface DecimoTerceiroResult {
  ano: number;
  avos: number;
  valor: number;
  fundamentos: string[];
}

/** 13º proporcional do ano de `dataFim`: cada mês com 15 dias ou mais trabalhados vale 1/12. */
export function calcularDecimoTerceiro(
  input: DecimoTerceiroInput,
): DecimoTerceiroResult {
  const { start: admissao, end: fim } = parsePeriod(
    input,
    "dataAdmissao",
    "dataFim",
  );
  assertSalary(input.salario);

  const ano = fim.getUTCFullYear();
  let avos = 0;
  for (let month = 0; month <= fim.getUTCMonth(); month++) {
    const monthStart = new Date(Date.UTC(ano, month, 1));
    const monthEnd = new Date(Date.UTC(ano, month + 1, 0));
    const start = admissao > monthStart ? admissao : monthStart;
    const end = fim < monthEnd ? fim : monthEnd;
    if (end >= start && daysBetween(start, end) + 1 >= 15) avos++;
  }

  return {
    ano,
    avos,
    valor: roundCents((input.salario * avos) / 12),
    fundamentos: [
      "Lei 4.090/1962, art. 1º, § 1º: 1/12 da remuneração por mês de serviço no ano.",
      "Lei 4.090/1962, art. 1º, § 2º: fração de 15 dias ou mais conta como mês inteiro.",
      "Lei 4.090/1962, art. 3º: na dispensa por justa causa o 13º proporcional não é devido.",
    ],
  };
}
