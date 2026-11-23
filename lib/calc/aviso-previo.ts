import { addDays, parsePeriod, formatDate, wholeMonths } from "./dates";
import { assertSalary, roundCents } from "./money";

export const MOTIVOS = [
  "sem_justa_causa",
  "pedido_demissao",
  "justa_causa",
  "acordo",
] as const;
export type Motivo = (typeof MOTIVOS)[number];

export interface AvisoPrevioInput {
  dataAdmissao: string;
  dataDesligamento: string;
  salario: number;
  motivo: Motivo;
}

export interface AvisoPrevioResult {
  anosCompletos: number;
  dias: number;
  valorIndenizado: number;
  /** Data de saída somando o aviso indenizado: conta para férias e 13º (OJ 82 SDI-1). */
  dataProjetada: string;
  fundamentos: string[];
}

const MAX_ANOS_ADICIONAIS = 20;

export function calcularAvisoPrevio(
  input: AvisoPrevioInput,
): AvisoPrevioResult {
  const { start: admissao, end: desligamento } = parsePeriod(
    input,
    "dataAdmissao",
    "dataDesligamento",
  );
  assertSalary(input.salario);

  const anosCompletos = Math.floor(wholeMonths(admissao, desligamento) / 12);
  const proporcional = 30 + 3 * Math.min(anosCompletos, MAX_ANOS_ADICIONAIS);
  const valorDia = input.salario / 30;

  switch (input.motivo) {
    case "sem_justa_causa":
      return {
        anosCompletos,
        dias: proporcional,
        valorIndenizado: roundCents(valorDia * proporcional),
        dataProjetada: formatDate(addDays(desligamento, proporcional)),
        fundamentos: [
          "CLT, art. 487: aviso prévio de 30 dias.",
          "Lei 12.506/2011: mais 3 dias por ano completo de serviço, até 90 dias no total.",
        ],
      };
    case "acordo":
      return {
        anosCompletos,
        dias: proporcional,
        valorIndenizado: roundCents((valorDia * proporcional) / 2),
        dataProjetada: formatDate(addDays(desligamento, proporcional)),
        fundamentos: [
          "CLT, art. 484-A, I, a: no acordo, o aviso prévio indenizado é pago pela metade.",
          "Lei 12.506/2011: proporcionalidade de 3 dias por ano completo.",
        ],
      };
    case "pedido_demissao":
      return {
        anosCompletos,
        dias: 30,
        valorIndenizado: 0,
        dataProjetada: formatDate(desligamento),
        fundamentos: [
          "CLT, art. 487: quem pede demissão deve 30 dias de aviso ao empregador; se não cumprir, ele pode descontar (art. 487, § 2º).",
          "A proporcionalidade da Lei 12.506/2011 é só a favor do empregado.",
        ],
      };
    case "justa_causa":
      return {
        anosCompletos,
        dias: 0,
        valorIndenizado: 0,
        dataProjetada: formatDate(desligamento),
        fundamentos: [
          "CLT, art. 482: na dispensa por justa causa não há aviso prévio.",
        ],
      };
  }
}
