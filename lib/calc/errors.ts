/** Entrada inválida para um cálculo: a mensagem volta para o LLM pedir o dado certo. */
export class CalcError extends Error {
  override name = "CalcError";
}
