/**
 * Meses no fuso de São Paulo. O Brasil não tem horário de verão desde 2019,
 * então o fuso é fixo em UTC−3: meia-noite em São Paulo = 03:00 UTC.
 * (Se o horário de verão voltar, este arquivo é o único ponto a ajustar.)
 */
const OFFSET_HORAS = 3;

/** Ano e mês (1–12) de um instante, no horário de São Paulo. */
function anoMesSP(instante: Date): { ano: number; mes: number } {
  const local = new Date(instante.getTime() - OFFSET_HORAS * 3_600_000);
  return { ano: local.getUTCFullYear(), mes: local.getUTCMonth() + 1 };
}

/** Início (00:00 em São Paulo) do mês `deslocamento` meses a partir do mês de `agora`. */
export function inicioMesSP(agora: Date, deslocamento = 0): Date {
  const { ano, mes } = anoMesSP(agora);
  return new Date(Date.UTC(ano, mes - 1 + deslocamento, 1, OFFSET_HORAS));
}

const rotulo = (inicio: Date) => {
  const { ano, mes } = anoMesSP(inicio);
  return `${String(ano)}-${String(mes).padStart(2, '0')}`;
};

/** Os `n` últimos meses (incluindo o atual), do mais antigo ao mais novo: ["2026-06", …, "2026-11"]. */
export function ultimosMeses(agora: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => rotulo(inicioMesSP(agora, i - (n - 1))));
}
