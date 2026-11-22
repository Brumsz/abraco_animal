import { IDADE_MINIMA_CADASTRO, idadeEmAnos, lerDataIso } from '@abraco/shared';

import { erroValidacao } from '../../../shared/dominio/erros.js';

/** Converte "AAAA-MM-DD" em data UTC, rejeitando datas inexistentes (ex.: 2001-02-30). */
export function dataDeNascimento(entrada: string): Date {
  const data = lerDataIso(entrada);
  if (!data) throw erroValidacao('DATA_INVALIDA', 'Data de nascimento inválida', 'dataNasc');
  return data;
}

export { idadeEmAnos };

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
