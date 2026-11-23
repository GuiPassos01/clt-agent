import {
  addDays,
  addMonths,
  parsePeriod,
  daysBetween,
  formatDate,
  wholeMonths,
} from "./dates";
import { CalcError } from "./errors";
import { assertSalary, roundCents } from "./money";

export interface FeriasInput {
  dataAdmissao: string;
  /** Último dia trabalhado, já com a projeção do aviso indenizado, se houver. */
  dataFim: string;
  salario: number;
  /** Faltas injustificadas no período aquisitivo em curso. */
  faltasInjustificadas: number;
  /** Períodos aquisitivos completos cujas férias ainda não foram tiradas. */
  periodosVencidos: number;
}

export interface FeriasResult {
  periodoAquisitivoAtual: {
    inicio: string;
    avos: number;
    diasDeDireito: number;
  };
  proporcionais: { valor: number; terco: number };
  vencidas: { periodos: number; valor: number; terco: number };
  total: number;
  fundamentos: string[];
}

/** CLT, art. 130: dias de férias conforme as faltas injustificadas no período aquisitivo. */
export function diasDeFerias(faltas: number): number {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

function assertCount(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new CalcError(
      `${field} precisa ser um número inteiro maior ou igual a zero.`,
    );
}

export function calcularFerias(input: FeriasInput): FeriasResult {
  const { start: admissao, end: fim } = parsePeriod(
    input,
    "dataAdmissao",
    "dataFim",
  );
  assertSalary(input.salario);
  assertCount(input.faltasInjustificadas, "faltasInjustificadas");
  assertCount(input.periodosVencidos, "periodosVencidos");

  const anosCompletos = Math.floor(wholeMonths(admissao, fim) / 12);
  if (input.periodosVencidos > anosCompletos) {
    throw new CalcError(
      `periodosVencidos (${input.periodosVencidos}) passa dos ${anosCompletos} períodos aquisitivos completos.`,
    );
  }

  const inicio = addMonths(admissao, anosCompletos * 12);
  const meses = wholeMonths(inicio, fim);
  const resto = daysBetween(addMonths(inicio, meses), addDays(fim, 1));
  const avos = Math.min(meses + (resto >= 15 ? 1 : 0), 12);
  const diasDeDireito = diasDeFerias(input.faltasInjustificadas);

  const proporcionais = roundCents(
    input.salario * (diasDeDireito / 30) * (avos / 12),
  );
  const vencidas = roundCents(input.salario * input.periodosVencidos);
  const tercoProporcionais = roundCents(proporcionais / 3);
  const tercoVencidas = roundCents(vencidas / 3);

  return {
    periodoAquisitivoAtual: { inicio: formatDate(inicio), avos, diasDeDireito },
    proporcionais: { valor: proporcionais, terco: tercoProporcionais },
    vencidas: {
      periodos: input.periodosVencidos,
      valor: vencidas,
      terco: tercoVencidas,
    },
    total: roundCents(
      proporcionais + tercoProporcionais + vencidas + tercoVencidas,
    ),
    fundamentos: [
      "CLT, art. 130: dias de férias reduzidos conforme as faltas injustificadas.",
      "CLT, art. 146, parágrafo único: 1/12 por mês de serviço ou fração superior a 14 dias.",
      "CF, art. 7º, XVII: adicional de 1/3 sobre as férias.",
      "CLT, art. 137: férias vencidas não concedidas no período concessivo são pagas em dobro (não incluído neste cálculo).",
      "Súmula 171 do TST: na justa causa, as férias proporcionais não são devidas; as vencidas, sim.",
    ],
  };
}
