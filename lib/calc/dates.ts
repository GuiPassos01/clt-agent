import { CalcError } from "./errors";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** Datas sempre em UTC à meia-noite: sem fuso, um dia é sempre 24h. */
export function parseDate(value: string, field: string): Date {
  const match = ISO_DATE.exec(value);
  if (!match)
    throw new CalcError(`${field} precisa estar no formato AAAA-MM-DD.`);
  const [, year, month, day] = match.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1)
    throw new CalcError(`${field} não é uma data válida.`);
  return date;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Soma meses mantendo o dia; se o mês não tem o dia (31/01 + 1 mês), cai no último dia. */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/** Meses inteiros de `start` até `end` (inclusive): 10/03 a 09/04 é um mês. */
export function wholeMonths(start: Date, end: Date): number {
  const afterEnd = addDays(end, 1);
  let months = 0;
  while (addMonths(start, months + 1) <= afterEnd) months++;
  return months;
}

/** Lê as duas datas de um período e garante que o fim não vem antes do início. */
export function parsePeriod<TField extends string>(
  input: Record<TField, string>,
  startField: TField,
  endField: TField,
): { start: Date; end: Date } {
  const start = parseDate(input[startField], startField);
  const end = parseDate(input[endField], endField);
  if (end < start)
    throw new CalcError(`${endField} não pode ser antes de ${startField}.`);
  return { start, end };
}
