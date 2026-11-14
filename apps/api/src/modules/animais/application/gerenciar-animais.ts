/** Casos de uso administrativos do cadastro de animais (rotas /admin/*). */
import type { StatusAnimal } from '@abraco/shared';

import type { ArmazenamentoObjetos } from '../../../shared/aplicacao/armazenamento.js';
import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';
import {
  transicaoManual,
  validarDadosAnimal,
  validarStatusInicial,
  type DadosAnimal,
} from '../domain/animal.js';
import { animalNaoEncontrado, detalheSaida, type AnimalDetalheSaida } from './apresentacao.js';
import type { AnimalCompleto, RepositorioAnimais } from './portas.js';

interface Deps {
  readonly animais: RepositorioAnimais;
  readonly armazenamento: ArmazenamentoObjetos;
  readonly relogio: Relogio;
}

/** Busca para escrita: removido ou inexistente → 404. */
export async function exigirAnimal(
  animais: RepositorioAnimais,
  id: string,
): Promise<AnimalCompleto> {
  const animal = await animais.buscar(id);
  if (!animal) throw animalNaoEncontrado();
  return animal;
}

const CAMPOS_EDITAVEIS = [
  'nome',
  'tipo',
  'raca',
  'idadeAprox',
  'sexo',
  'porte',
  'descricao',
  'historiaResgate',
  'vacinado',
  'castrado',
] as const satisfies readonly (keyof DadosAnimal)[];

export class CriarAnimal {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    dados: DadosAnimal;
    status?: StatusAnimal;
  }): Promise<AnimalDetalheSaida> {
    exigirAdmin(entrada.ator);
    const dados = validarDadosAnimal(entrada.dados);
    const status = validarStatusInicial(entrada.status ?? 'DISPONIVEL');
    const criado = await this.deps.animais.criar(
      { ...dados, status },
      { adminId: entrada.ator.id, acao: 'ANIMAL_CRIADO', detalhe: { status } },
    );
    return detalheSaida(criado, this.deps.armazenamento);
  }
}

export class AtualizarAnimal {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    id: string;
    dados: DadosAnimal;
  }): Promise<AnimalDetalheSaida> {
    exigirAdmin(entrada.ator);
    const animal = await exigirAnimal(this.deps.animais, entrada.id);
    const dados = validarDadosAnimal(entrada.dados);
    // A auditoria registra QUAIS campos mudaram, sem os valores (textos longos).
    const alterados = CAMPOS_EDITAVEIS.filter((c) => animal[c] !== dados[c]);
    if (alterados.length > 0) {
      await this.deps.animais.atualizar(animal, dados, {
        adminId: entrada.ator.id,
        acao: 'ANIMAL_ATUALIZADO',
        detalhe: { campos: alterados },
      });
    }
    return detalheSaida({ ...animal, ...dados }, this.deps.armazenamento);
  }
}

export class AlterarStatusAnimal {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    id: string;
    status: StatusAnimal;
  }): Promise<AnimalDetalheSaida> {
    exigirAdmin(entrada.ator);
    const animal = await exigirAnimal(this.deps.animais, entrada.id);
    const novo = transicaoManual(animal.status, entrada.status);
    if (novo) {
      await this.deps.animais.alterarStatus(animal, novo, {
        adminId: entrada.ator.id,
        acao: 'ANIMAL_STATUS_ALTERADO',
        detalhe: { de: animal.status, para: novo },
      });
    }
    return detalheSaida({ ...animal, status: novo ?? animal.status }, this.deps.armazenamento);
  }
}

export class RemoverAnimal {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    exigirAdmin(entrada.ator);
    const animal = await exigirAnimal(this.deps.animais, entrada.id);
    // Soft delete: fotos e histórico (adoções, apadrinhamentos) são preservados.
    await this.deps.animais.remover(animal, this.deps.relogio.agora(), {
      adminId: entrada.ator.id,
      acao: 'ANIMAL_REMOVIDO',
      detalhe: { status: animal.status },
    });
  }
}
