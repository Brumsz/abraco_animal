import { IDADE_MINIMA_CADASTRO } from '@abraco/shared';

import { erroValidacao } from '../../../shared/dominio/erros.js';

/** Converte "AAAA-MM-DD" em data UTC, rejeitando datas inexistentes (ex.: 2001-02-30). */
export function dataDeNascimento(entrada: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entrada);
  if (!m) throw erroValidacao('DATA_INVALIDA', 'Data de nascimento inválida', 'dataNasc');
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw erroValidacao('DATA_INVALIDA', 'Data de nascimento inválida', 'dataNasc');
  }
  return data;
}

export function idadeEmAnos(nascimento: Date, hoje: Date): number {
  let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
  const aindaNaoFezAniversario =
    hoje.getUTCMonth() < nascimento.getUTCMonth() ||
    (hoje.getUTCMonth() === nascimento.getUTCMonth() &&
      hoje.getUTCDate() < nascimento.getUTCDate());
  if (aindaNaoFezAniversario) idade -= 1;
  return idade;
}

/** Regra D7: cadastro só para maiores de 18 anos. */
export function garantirIdadeMinima(nascimento: Date, hoje: Date): void {
  if (nascimento > hoje) {
    throw erroValidacao('DATA_INVALIDA', 'Data de nascimento no futuro', 'dataNasc');
  }
  if (idadeEmAnos(nascimento, hoje) < IDADE_MINIMA_CADASTRO) {
    throw erroValidacao(
      'IDADE_MINIMA',
      `É preciso ter pelo menos ${IDADE_MINIMA_CADASTRO} anos para se cadastrar`,
      'dataNasc',
    );
  }
}
