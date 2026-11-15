import type { Role } from '@abraco/shared';

import type { ArmazenamentoObjetos } from '../../../shared/aplicacao/armazenamento.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import {
  animalNaoEncontrado,
  resumoSaida,
  type AnimalResumoSaida,
} from '../../animais/application/apresentacao.js';
import type {
  AnimalRegistro,
  AnimalResumoRegistro,
  RepositorioAnimais,
} from '../../animais/application/portas.js';
import { podeVerAnimal } from '../../animais/domain/animal.js';
import {
  exigirApadrinhavel,
  exigirPadrinho,
  primeiroNome,
  validarMensagem,
} from '../domain/apadrinhamento.js';

// ── Portas ───────────────────────────────────────────────────────────────

export interface ApadrinhamentoRegistro {
  readonly id: number;
  readonly publicId: string;
  /** publicId do padrinho. */
  readonly padrinhoId: string | null;
  readonly ativo: boolean;
  readonly mensagemPadrinho: string | null;
  readonly criadoEm: Date;
  readonly animal: AnimalResumoRegistro;
}

export interface PadrinhoRegistro {
  readonly nome: string;
  /** Chave da foto de perfil no bucket, se houver. */
  readonly fotoChave: string | null;
  readonly mensagemPadrinho: string | null;
}

export interface RepositorioApadrinhamentos {
  /**
   * Cria, ou reativa um apadrinhamento encerrado do mesmo usuário com o mesmo
   * animal (UNIQUE usuário+animal). Já ativo → CONFLITO `JA_PADRINHO`.
   */
  apadrinhar(d: {
    padrinhoId: string;
    animal: AnimalRegistro;
    mensagem: string | null;
  }): Promise<ApadrinhamentoRegistro>;
  buscar(publicId: string): Promise<ApadrinhamentoRegistro | null>;
  encerrar(apadrinhamento: ApadrinhamentoRegistro): Promise<void>;
  /** Só os ativos, mais recentes primeiro. */
  listarDoPadrinho(padrinhoId: string): Promise<ApadrinhamentoRegistro[]>;
  /** Padrinhos ativos do animal, mais recentes primeiro. */
  listarPadrinhos(animalId: number, limite: number): Promise<PadrinhoRegistro[]>;
}

interface Deps {
  readonly apadrinhamentos: RepositorioApadrinhamentos;
  readonly animais: RepositorioAnimais;
  readonly armazenamento: ArmazenamentoObjetos;
}

// ── Saídas ───────────────────────────────────────────────────────────────

export interface ApadrinhamentoSaida {
  readonly id: string;
  readonly animal: AnimalResumoSaida;
  readonly ativo: boolean;
  readonly mensagemPadrinho: string | null;
  readonly criadoEm: Date;
}

async function saida(a: ApadrinhamentoRegistro, armazenamento: ArmazenamentoObjetos) {
  return {
    id: a.publicId,
    animal: await resumoSaida(a.animal, armazenamento),
    ativo: a.ativo,
    mensagemPadrinho: a.mensagemPadrinho,
    criadoEm: a.criadoEm,
  };
}

export const LIMITE_PADRINHOS = 50;

// ── Casos de uso ─────────────────────────────────────────────────────────

export class Apadrinhar {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    animalId: string;
    mensagemPadrinho?: string | null;
  }): Promise<ApadrinhamentoSaida> {
    const mensagem = validarMensagem(entrada.mensagemPadrinho);
    const animal = await this.deps.animais.buscar(entrada.animalId);
    if (!animal) throw animalNaoEncontrado();
    exigirApadrinhavel(animal.status);
    const a = await this.deps.apadrinhamentos.apadrinhar({
      padrinhoId: entrada.ator.id,
      animal,
      mensagem,
    });
    return saida(a, this.deps.armazenamento);
  }
}

export class ListarMeusApadrinhamentos {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator }): Promise<ApadrinhamentoSaida[]> {
    const lista = await this.deps.apadrinhamentos.listarDoPadrinho(entrada.ator.id);
    return Promise.all(lista.map((a) => saida(a, this.deps.armazenamento)));
  }
}

export class EncerrarApadrinhamento {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    const a = await this.deps.apadrinhamentos.buscar(entrada.id);
    if (!a) {
      throw new ErroDominio(
        'NAO_ENCONTRADO',
        'APADRINHAMENTO_NAO_ENCONTRADO',
        'Apadrinhamento não encontrado',
      );
    }
    exigirPadrinho(entrada.ator, a.padrinhoId);
    // Encerrar de novo é idempotente.
    if (a.ativo) await this.deps.apadrinhamentos.encerrar(a);
  }
}

export class ListarPadrinhos {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { animalId: string; role?: Role }) {
    const animal = await this.deps.animais.buscar(entrada.animalId);
    // Mesma visibilidade do detalhe do animal (INDISPONIVEL só para a equipe).
    if (!animal || !podeVerAnimal(animal.status, entrada.role)) throw animalNaoEncontrado();
    const padrinhos = await this.deps.apadrinhamentos.listarPadrinhos(animal.id, LIMITE_PADRINHOS);
    return Promise.all(
      padrinhos.map(async (p) => ({
        nome: primeiroNome(p.nome),
        fotoUrl: p.fotoChave ? await this.deps.armazenamento.urlAssinada(p.fotoChave) : null,
        mensagemPadrinho: p.mensagemPadrinho,
      })),
    );
  }
}
