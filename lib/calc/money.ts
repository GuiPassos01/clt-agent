import { CalcError } from "./errors";

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function assertSalary(value: number): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new CalcError("O salário precisa ser um valor positivo.");
}
