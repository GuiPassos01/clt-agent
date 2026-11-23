import { describe, expect, test } from "bun:test";

import { calcularAvisoPrevio } from "./aviso-previo";
import { addMonths, parseDate, wholeMonths } from "./dates";
import { calcularDecimoTerceiro } from "./decimo-terceiro";
import { CalcError } from "./errors";
import { calcularFerias, diasDeFerias } from "./ferias";

describe("datas", () => {
  test("rejeita formato e data inexistente", () => {
    expect(() => parseDate("10/01/2020", "data")).toThrow(CalcError);
    expect(() => parseDate("2024-02-30", "data")).toThrow(CalcError);
  });

  test("somar meses cai no último dia quando o dia não existe", () => {
    expect(
      addMonths(parseDate("2024-01-31", "d"), 1).toISOString().slice(0, 10),
    ).toBe("2024-02-29");
  });

  test("meses inteiros contam o último dia", () => {
    expect(
      wholeMonths(parseDate("2024-03-10", "d"), parseDate("2024-04-09", "d")),
    ).toBe(1);
    expect(
      wholeMonths(parseDate("2024-03-10", "d"), parseDate("2024-04-08", "d")),
    ).toBe(0);
  });
});

describe("aviso prévio", () => {
  const base = {
    dataAdmissao: "2020-01-10",
    dataDesligamento: "2024-05-03",
    salario: 3000,
  };

  test("sem justa causa: 30 + 3 por ano completo, com projeção", () => {
    const result = calcularAvisoPrevio({ ...base, motivo: "sem_justa_causa" });
    expect(result).toMatchObject({
      anosCompletos: 4,
      dias: 42,
      valorIndenizado: 4200,
      dataProjetada: "2024-06-14",
    });
  });

  test("um ano completo no último dia já soma 3 dias", () => {
    const result = calcularAvisoPrevio({
      dataAdmissao: "2023-03-01",
      dataDesligamento: "2024-02-29",
      salario: 3000,
      motivo: "sem_justa_causa",
    });
    expect(result.dias).toBe(33);
  });

  test("teto de 90 dias", () => {
    const result = calcularAvisoPrevio({
      dataAdmissao: "1990-01-01",
      dataDesligamento: "2024-01-01",
      salario: 3000,
      motivo: "sem_justa_causa",
    });
    expect(result.dias).toBe(90);
  });

  test("acordo paga metade; pedido de demissão e justa causa não indenizam", () => {
    expect(
      calcularAvisoPrevio({ ...base, motivo: "acordo" }).valorIndenizado,
    ).toBe(2100);
    expect(
      calcularAvisoPrevio({ ...base, motivo: "pedido_demissao" }),
    ).toMatchObject({
      dias: 30,
      valorIndenizado: 0,
      dataProjetada: "2024-05-03",
    });
    expect(
      calcularAvisoPrevio({ ...base, motivo: "justa_causa" }),
    ).toMatchObject({ dias: 0, valorIndenizado: 0 });
  });

  test("desligamento antes da admissão é erro", () => {
    expect(() =>
      calcularAvisoPrevio({
        ...base,
        dataDesligamento: "2019-01-01",
        motivo: "sem_justa_causa",
      }),
    ).toThrow(CalcError);
  });
});

describe("13º proporcional", () => {
  test("mês com menos de 15 dias não conta", () => {
    const result = calcularDecimoTerceiro({
      dataAdmissao: "2020-01-10",
      dataFim: "2024-06-14",
      salario: 3000,
    });
    expect(result).toMatchObject({ ano: 2024, avos: 5, valor: 1250 });
  });

  test("admitido no meio do ano: mês de admissão com 15 dias conta", () => {
    const result = calcularDecimoTerceiro({
      dataAdmissao: "2024-03-17",
      dataFim: "2024-12-31",
      salario: 3000,
    });
    expect(result).toMatchObject({ avos: 10, valor: 2500 });
  });
});

describe("férias", () => {
  const base = {
    dataAdmissao: "2020-01-10",
    dataFim: "2024-06-14",
    salario: 3000,
    faltasInjustificadas: 0,
    periodosVencidos: 0,
  };

  test("proporcionais com 1/3", () => {
    const result = calcularFerias(base);
    expect(result.periodoAquisitivoAtual).toEqual({
      inicio: "2024-01-10",
      avos: 5,
      diasDeDireito: 30,
    });
    expect(result.proporcionais).toEqual({ valor: 1250, terco: 416.67 });
    expect(result.total).toBe(1666.67);
  });

  test("fração de 15 dias conta como mês", () => {
    expect(
      calcularFerias({ ...base, dataFim: "2024-06-24" }).periodoAquisitivoAtual
        .avos,
    ).toBe(6);
  });

  test("vencidas somam salário integral com 1/3", () => {
    const result = calcularFerias({ ...base, periodosVencidos: 1 });
    expect(result.vencidas).toEqual({ periodos: 1, valor: 3000, terco: 1000 });
    expect(result.total).toBe(5666.67);
  });

  test("faltas reduzem os dias (art. 130)", () => {
    expect([5, 6, 14, 15, 23, 24, 32, 33].map(diasDeFerias)).toEqual([
      30, 24, 24, 18, 18, 12, 12, 0,
    ]);
    expect(
      calcularFerias({ ...base, faltasInjustificadas: 10 }).proporcionais.valor,
    ).toBe(1000);
  });

  test("mais períodos vencidos que anos completos é erro", () => {
    expect(() => calcularFerias({ ...base, periodosVencidos: 5 })).toThrow(
      CalcError,
    );
  });
});
