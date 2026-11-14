import type { Porte, Role, Sexo, StatusAnimal, TipoAnimal } from '@abraco/shared';

import type { ArmazenamentoObjetos } from '../../../shared/aplicacao/armazenamento.js';
import { podeVerAnimal, statusDaListagem } from '../domain/animal.js';
import {
  animalNaoEncontrado,
  detalheSaida,
  resumoSaida,
  type AnimalDetalheSaida,
  type AnimalResumoSaida,
} from './apresentacao.js';
import type { CursorAnimais, RepositorioAnimais } from './portas.js';

interface Deps {
  readonly animais: RepositorioAnimais;
  readonly armazenamento: ArmazenamentoObjetos;
}

export const LIMITE_PAGINA = { padrao: 20, maximo: 50 } as const;

export interface EntradaListagem {
  /** Role de quem pede; `undefined` = anônimo. */
  readonly role?: Role;
  readonly q?: string;
  readonly tipo?: TipoAnimal;
  readonly porte?: Porte;
  readonly sexo?: Sexo;
  readonly status?: StatusAnimal;
  readonly cursor?: CursorAnimais;
  readonly limite?: number;
}

export interface PaginaAnimais {
  readonly itens: AnimalResumoSaida[];
  readonly proximoCursor: CursorAnimais | null;
}

export class ListarAnimais {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: EntradaListagem): Promise<PaginaAnimais> {
    const limite = Math.min(
      Math.max(Math.trunc(entrada.limite ?? LIMITE_PAGINA.padrao), 1),
      LIMITE_PAGINA.maximo,
    );
    const q = entrada.q?.trim();
    const status = statusDaListagem(entrada.role, entrada.status);
    // Pede um a mais para saber se existe próxima página sem um COUNT.
    const registros = await this.deps.animais.listar(
      {
        ...(q ? { q } : {}),
        ...(entrada.tipo ? { tipo: entrada.tipo } : {}),
        ...(entrada.porte ? { porte: entrada.porte } : {}),
        ...(entrada.sexo ? { sexo: entrada.sexo } : {}),
        ...(status ? { status } : {}),
      },
      entrada.cursor,
      limite + 1,
    );

    const pagina = registros.slice(0, limite);
    const ultimo = pagina.at(-1);
    return {
      itens: await Promise.all(pagina.map((a) => resumoSaida(a, this.deps.armazenamento))),
      proximoCursor:
        registros.length > limite && ultimo
          ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
          : null,
    };
  }
}

export class ObterAnimal {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { id: string; role?: Role }): Promise<AnimalDetalheSaida> {
    const animal = await this.deps.animais.buscar(entrada.id);
    // INDISPONIVEL para o público responde 404, sem confirmar que o animal existe.
    if (!animal || !podeVerAnimal(animal.status, entrada.role)) throw animalNaoEncontrado();
    return detalheSaida(animal, this.deps.armazenamento);
  }
}
