/** Casos de uso do fluxo de adoção (usuário e admin). */
import type { StatusAdocao } from '@abraco/shared';

import type { ArmazenamentoObjetos } from '../../../shared/aplicacao/armazenamento.js';
import type { EmailsAdocao } from '../../../shared/aplicacao/emails-adocao.js';
import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';
import type { RepositorioAnimais } from '../../animais/application/portas.js';
import { animalNaoEncontrado } from '../../animais/application/apresentacao.js';
import { transicaoParaAdotado } from '../../animais/domain/animal.js';
import {
  exigirAcessoAdocao,
  exigirPendente,
  impedirAutoaprovacao,
  MOTIVO_RECUSA_AUTOMATICA,
  validarMotivoRecusa,
  validarTriagem,
  type EntradaTriagem,
} from '../domain/adocao.js';
import {
  adocaoAdminSaida,
  adocaoNaoEncontrada,
  adocaoSaida,
  NOTIFICACOES,
  type AdocaoAdminSaida,
  type AdocaoSaida,
} from './apresentacao.js';
import type {
  AdocaoDetalhada,
  CursorAdocoes,
  FiltroAdocoes,
  RepositorioAdocoes,
} from './portas.js';

export interface DepsAdocoes {
  readonly adocoes: RepositorioAdocoes;
  readonly animais: RepositorioAnimais;
  readonly armazenamento: ArmazenamentoObjetos;
  readonly emails: EmailsAdocao;
  readonly relogio: Relogio;
  /** Falha ao ENFILEIRAR um e-mail (não ao enviar): registrada, sem desfazer a operação. */
  readonly aoFalharEmail?: (erro: unknown) => void;
}

export const LIMITE_PAGINA_ADOCOES = { padrao: 20, maximo: 50 } as const;

export interface Pagina<T> {
  readonly itens: T[];
  readonly proximoCursor: CursorAdocoes | null;
}

const limitar = (limite: number | undefined) =>
  Math.min(
    Math.max(Math.trunc(limite ?? LIMITE_PAGINA_ADOCOES.padrao), 1),
    LIMITE_PAGINA_ADOCOES.maximo,
  );

/**
 * O e-mail sai DEPOIS do commit. Se o enfileiramento falhar, a operação
 * continua valendo (a notificação no app já foi gravada na transação) — devolver
 * erro faria o app repetir uma ação que já aconteceu.
 */
async function enviarSemFalhar(deps: DepsAdocoes, envio: () => Promise<void>): Promise<void> {
  try {
    await envio();
  } catch (erro) {
    deps.aoFalharEmail?.(erro);
  }
}

async function listarPagina(
  deps: DepsAdocoes,
  filtro: FiltroAdocoes,
  cursor: CursorAdocoes | undefined,
  limite: number | undefined,
): Promise<Pagina<AdocaoSaida>> {
  const n = limitar(limite);
  const registros = await deps.adocoes.listar(filtro, cursor, n + 1);
  const pagina = registros.slice(0, n);
  const ultimo = pagina.at(-1);
  return {
    itens: await Promise.all(pagina.map((a) => adocaoSaida(a, deps.armazenamento))),
    proximoCursor:
      registros.length > n && ultimo
        ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
        : null,
  };
}

async function exigirAdocao(adocoes: RepositorioAdocoes, id: string): Promise<AdocaoDetalhada> {
  const adocao = await adocoes.buscar(id);
  if (!adocao) throw adocaoNaoEncontrada();
  return adocao;
}

// ── Usuário ──────────────────────────────────────────────────────────────

export class SolicitarAdocao {
  constructor(private readonly deps: DepsAdocoes) {}

  async executar(entrada: {
    ator: Ator;
    animalId: string;
    triagem: EntradaTriagem;
  }): Promise<AdocaoSaida> {
    const triagem = validarTriagem(entrada.triagem);
    const animal = await this.deps.animais.buscar(entrada.animalId);
    if (!animal) throw animalNaoEncontrado();
    if (animal.status !== 'DISPONIVEL') {
      throw new ErroDominio(
        'CONFLITO',
        'ANIMAL_NAO_DISPONIVEL',
        'Este animal não está disponível para adoção no momento',
      );
    }

    const adocao = await this.deps.adocoes.criar({
      solicitanteId: entrada.ator.id,
      animal,
      triagem,
      termoAceitoEm: this.deps.relogio.agora(),
    });

    const s = adocao.solicitante;
    if (s) {
      await enviarSemFalhar(this.deps, () =>
        this.deps.emails.adocaoRecebida({ para: s.email, nome: s.nome, animal: animal.nome }),
      );
    }
    return adocaoSaida(adocao, this.deps.armazenamento);
  }
}

export class ListarMinhasAdocoes {
  constructor(private readonly deps: DepsAdocoes) {}

  async executar(entrada: {
    ator: Ator;
    cursor?: CursorAdocoes;
    limite?: number;
  }): Promise<Pagina<AdocaoSaida>> {
    // O filtro vem do token, nunca de um parâmetro: não há como listar as de outra pessoa.
    return listarPagina(
      this.deps,
      { solicitanteId: entrada.ator.id },
      entrada.cursor,
      entrada.limite,
    );
  }
}

export class ObterAdocao {
  constructor(private readonly deps: DepsAdocoes) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<AdocaoSaida> {
    const adocao = await exigirAdocao(this.deps.adocoes, entrada.id);
    exigirAcessoAdocao(entrada.ator, adocao.solicitanteId);
    return adocaoSaida(adocao, this.deps.armazenamento);
  }
}

// ── Admin ────────────────────────────────────────────────────────────────

export class AdminListarAdocoes {
  constructor(private readonly deps: DepsAdocoes) {}

  async executar(entrada: {
    ator: Ator;
    status?: StatusAdocao;
    animalId?: string;
    de?: Date;
    ate?: Date;
    cursor?: CursorAdocoes;
    limite?: number;
  }): Promise<Pagina<AdocaoSaida>> {
    exigirAdmin(entrada.ator);
    const { status, animalId, de, ate } = entrada;
    const filtro: FiltroAdocoes = {
      ...(status ? { status } : {}),
      ...(animalId ? { animalId } : {}),
      ...(de ? { de } : {}),
      ...(ate ? { ate } : {}),
    };
    return listarPagina(this.deps, filtro, entrada.cursor, entrada.limite);
  }
}

export class AdminObterAdocao {
  constructor(private readonly deps: DepsAdocoes) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<AdocaoAdminSaida> {
    exigirAdmin(entrada.ator);
    return adocaoAdminSaida(
      await exigirAdocao(this.deps.adocoes, entrada.id),
      this.deps.armazenamento,
    );
  }
}

export class AprovarAdocao {
  constructor(private readonly deps: DepsAdocoes) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<AdocaoAdminSaida> {
    exigirAdmin(entrada.ator);
    const adocao = await exigirAdocao(this.deps.adocoes, entrada.id);
    exigirPendente(adocao.status);
    impedirAutoaprovacao(entrada.ator, adocao.solicitanteId);
    transicaoParaAdotado(adocao.animal.status);

    const em = this.deps.relogio.agora();
    const animal = adocao.animal.nome;
    const encerradas = await this.deps.adocoes.aprovar(adocao, {
      em,
      notificacaoAprovada: NOTIFICACOES.aprovada(animal),
      notificacaoEncerrada: NOTIFICACOES.encerrada(animal),
      motivoEncerrada: MOTIVO_RECUSA_AUTOMATICA,
      auditoria: {
        adminId: entrada.ator.id,
        acao: 'ADOCAO_APROVADA',
        // O repositório acrescenta `encerradas` (ids recusados automaticamente na transação).
        detalhe: { animalId: adocao.animal.publicId },
      },
    });

    const s = adocao.solicitante;
    if (s) {
      await enviarSemFalhar(this.deps, () =>
        this.deps.emails.adocaoAprovada({ para: s.email, nome: s.nome, animal }),
      );
    }
    for (const e of encerradas) {
      const d = e.solicitante;
      if (d) {
        await enviarSemFalhar(this.deps, () =>
          this.deps.emails.adocaoEncerrada({ para: d.email, nome: d.nome, animal }),
        );
      }
    }

    return adocaoAdminSaida(
      await exigirAdocao(this.deps.adocoes, adocao.publicId),
      this.deps.armazenamento,
    );
  }
}

export class RecusarAdocao {
  constructor(private readonly deps: DepsAdocoes) {}

  async executar(entrada: { ator: Ator; id: string; motivo: string }): Promise<AdocaoAdminSaida> {
    exigirAdmin(entrada.ator);
    const motivo = validarMotivoRecusa(entrada.motivo);
    const adocao = await exigirAdocao(this.deps.adocoes, entrada.id);
    exigirPendente(adocao.status);

    const em = this.deps.relogio.agora();
    await this.deps.adocoes.recusar(adocao, {
      em,
      motivo,
      notificacao: NOTIFICACOES.recusada(adocao.animal.nome),
      // O motivo fica na adoção; a auditoria guarda só o fato (texto livre pode ter dado pessoal).
      auditoria: {
        adminId: entrada.ator.id,
        acao: 'ADOCAO_RECUSADA',
        detalhe: { animalId: adocao.animal.publicId },
      },
    });

    const s = adocao.solicitante;
    if (s) {
      await enviarSemFalhar(this.deps, () =>
        this.deps.emails.adocaoRecusada({
          para: s.email,
          nome: s.nome,
          animal: adocao.animal.nome,
          motivo,
        }),
      );
    }
    return adocaoAdminSaida(
      await exigirAdocao(this.deps.adocoes, adocao.publicId),
      this.deps.armazenamento,
    );
  }
}
