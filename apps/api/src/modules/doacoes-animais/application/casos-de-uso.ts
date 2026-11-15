/** Casos de uso da doação de animais à ONG (doador e admin). */
import { randomUUID } from 'node:crypto';

import {
  UPLOAD_IMAGENS,
  type Porte,
  type Sexo,
  type StatusDoacaoAnimal,
  type TipoAnimal,
} from '@abraco/shared';

import {
  removerSemFalhar,
  type ArmazenamentoObjetos,
} from '../../../shared/aplicacao/armazenamento.js';
import type { EmailsDoacaoAnimal } from '../../../shared/aplicacao/emails-doacao-animal.js';
import { prepararImagens, type ProcessadorImagens } from '../../../shared/aplicacao/imagens.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';
import { fotoSaida, type FotoSaida } from '../../animais/application/apresentacao.js';
import { validarDadosAnimal } from '../../animais/domain/animal.js';
import { validarMotivoRecusa } from '../../adocoes/domain/adocao.js';
import {
  exigirAcessoDoacao,
  exigirParaAprovar,
  exigirParaRecusar,
  exigirQuantidadeFotos,
  jaRecebida,
  montarTimelineDoacao,
  paraDadosAnimal,
  validarDoacao,
  type DadosDoacao,
  type EtapaDoacao,
} from '../domain/doacao-animal.js';
import type {
  CursorDoacoes,
  DoacaoDetalhada,
  DoacaoRegistro,
  FiltroDoacoes,
  RepositorioDoacoesAnimais,
} from './portas.js';

export interface DepsDoacoes {
  readonly doacoes: RepositorioDoacoesAnimais;
  readonly armazenamento: ArmazenamentoObjetos;
  readonly imagens: ProcessadorImagens;
  readonly emails: EmailsDoacaoAnimal;
  readonly relogio: Relogio;
  readonly gerarId?: () => string;
  readonly aoFalharEmail?: (erro: unknown) => void;
}

// ── Saídas ───────────────────────────────────────────────────────────────

export interface DoacaoSaida {
  readonly id: string;
  readonly status: StatusDoacaoAnimal;
  readonly nomeAnimal: string;
  readonly tipo: TipoAnimal;
  readonly raca: string;
  readonly idadeAprox: number;
  readonly sexo: Sexo;
  readonly porte: Porte;
  readonly descricao: string;
  readonly motivoDoacao: string;
  readonly enderecoRetirada: string;
  readonly fotos: FotoSaida[];
  readonly motivoRecusa: string | null;
  readonly analisadoEm: Date | null;
  readonly recebidoEm: Date | null;
  readonly animalCriadoId: string | null;
  readonly criadoEm: Date;
  readonly timeline: { etapa: EtapaDoacao; em: Date | null }[];
}

export interface DoacaoAdminSaida extends DoacaoSaida {
  readonly doador: { id: string; nome: string; email: string; telefone: string } | null;
  readonly analisadoPor: string | null;
}

async function doacaoSaida(
  d: DoacaoRegistro,
  armazenamento: ArmazenamentoObjetos,
): Promise<DoacaoSaida> {
  return {
    id: d.publicId,
    status: d.status,
    nomeAnimal: d.nomeAnimal,
    tipo: d.tipo,
    raca: d.raca,
    idadeAprox: d.idadeAprox,
    sexo: d.sexo,
    porte: d.porte,
    descricao: d.descricao,
    motivoDoacao: d.motivoDoacao,
    enderecoRetirada: d.enderecoRetirada,
    fotos: await Promise.all(d.fotos.map((f) => fotoSaida(f, armazenamento))),
    motivoRecusa: d.motivoRecusa,
    analisadoEm: d.analisadoEm,
    recebidoEm: d.recebidoEm,
    animalCriadoId: d.animalCriadoId,
    criadoEm: d.criadoEm,
    timeline: montarTimelineDoacao(d),
  };
}

async function doacaoAdminSaida(
  d: DoacaoDetalhada,
  armazenamento: ArmazenamentoObjetos,
): Promise<DoacaoAdminSaida> {
  const doador = d.doador;
  return {
    ...(await doacaoSaida(d, armazenamento)),
    doador: doador
      ? { id: doador.publicId, nome: doador.nome, email: doador.email, telefone: doador.telefone }
      : null,
    analisadoPor: d.analisadoPor,
  };
}

/** Sem dados pessoais nem o motivo da recusa: podem aparecer na tela bloqueada (push). */
export const NOTIFICACOES_DOACAO = {
  aprovada: (animal: string): ConteudoNotificacao => ({
    tipo: 'DOACAO_ANIMAL_ATUALIZADA',
    titulo: 'Sua doação foi aceita 💛',
    corpo: `A ONG aceitou receber ${animal}. Entraremos em contato para combinar a retirada.`,
  }),
  recusada: (animal: string): ConteudoNotificacao => ({
    tipo: 'DOACAO_ANIMAL_ATUALIZADA',
    titulo: 'Sua oferta de doação foi analisada',
    corpo: `Não poderemos receber ${animal} agora. Toque para ver os detalhes.`,
  }),
  recebida: (animal: string): ConteudoNotificacao => ({
    tipo: 'DOACAO_ANIMAL_ATUALIZADA',
    titulo: `${animal} chegou à ONG!`,
    corpo: `${animal} já está com a gente. Obrigado por confiar na Abraço Animal!`,
  }),
} as const;

// ── Apoio ────────────────────────────────────────────────────────────────

const doacaoNaoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', 'DOACAO_NAO_ENCONTRADA', 'Doação não encontrada');

async function exigirDoacao(
  doacoes: RepositorioDoacoesAnimais,
  id: string,
): Promise<DoacaoDetalhada> {
  const d = await doacoes.buscar(id);
  if (!d) throw doacaoNaoEncontrada();
  return d;
}

async function enviarSemFalhar(deps: DepsDoacoes, envio: () => Promise<void>): Promise<void> {
  try {
    await envio();
  } catch (erro) {
    deps.aoFalharEmail?.(erro);
  }
}

export const LIMITE_PAGINA_DOACOES = { padrao: 20, maximo: 50 } as const;

async function listarPagina(
  deps: DepsDoacoes,
  filtro: FiltroDoacoes,
  cursor: CursorDoacoes | undefined,
  limite: number | undefined,
) {
  const n = Math.min(
    Math.max(Math.trunc(limite ?? LIMITE_PAGINA_DOACOES.padrao), 1),
    LIMITE_PAGINA_DOACOES.maximo,
  );
  const registros = await deps.doacoes.listar(filtro, cursor, n + 1);
  const pagina = registros.slice(0, n);
  const ultimo = pagina.at(-1);
  return {
    itens: await Promise.all(pagina.map((d) => doacaoSaida(d, deps.armazenamento))),
    proximoCursor:
      registros.length > n && ultimo
        ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
        : null,
  };
}

// ── Doador ───────────────────────────────────────────────────────────────

export class DoarAnimal {
  constructor(private readonly deps: DepsDoacoes) {}

  async executar(entrada: {
    ator: Ator;
    dados: DadosDoacao;
    arquivos: readonly Buffer[];
  }): Promise<DoacaoSaida> {
    const dados = validarDoacao(entrada.dados);
    exigirQuantidadeFotos(entrada.arquivos.length, UPLOAD_IMAGENS.arquivosPorEnvio);

    const imagens = await prepararImagens(entrada.arquivos, this.deps.imagens);
    const gerarId = this.deps.gerarId ?? randomUUID;
    const chaves = imagens.map((i) => `doacoes-animais/${gerarId()}.${i.extensao}`);

    let doacao: DoacaoDetalhada;
    try {
      await Promise.all(
        imagens.map((img, i) =>
          this.deps.armazenamento.enviar(chaves[i] ?? '', img.conteudo, img.tipoConteudo),
        ),
      );
      doacao = await this.deps.doacoes.criar({
        doadorId: entrada.ator.id,
        dados,
        chavesFotos: chaves,
      });
    } catch (erro) {
      // Compensação: nada fica no bucket se a doação não foi registrada.
      await removerSemFalhar(this.deps.armazenamento, chaves);
      throw erro;
    }

    const doador = doacao.doador;
    if (doador) {
      await enviarSemFalhar(this.deps, () =>
        this.deps.emails.doacaoEnviada({
          para: doador.email,
          nome: doador.nome,
          animal: dados.nomeAnimal,
        }),
      );
    }
    return doacaoSaida(doacao, this.deps.armazenamento);
  }
}

export class ListarMinhasDoacoes {
  constructor(private readonly deps: DepsDoacoes) {}

  async executar(entrada: { ator: Ator; cursor?: CursorDoacoes; limite?: number }) {
    return listarPagina(this.deps, { doadorId: entrada.ator.id }, entrada.cursor, entrada.limite);
  }
}

export class ObterDoacao {
  constructor(private readonly deps: DepsDoacoes) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<DoacaoSaida> {
    const d = await exigirDoacao(this.deps.doacoes, entrada.id);
    exigirAcessoDoacao(entrada.ator, d.doadorId);
    return doacaoSaida(d, this.deps.armazenamento);
  }
}

// ── Admin ────────────────────────────────────────────────────────────────

export class AdminListarDoacoes {
  constructor(private readonly deps: DepsDoacoes) {}

  async executar(entrada: {
    ator: Ator;
    status?: StatusDoacaoAnimal;
    de?: Date;
    ate?: Date;
    cursor?: CursorDoacoes;
    limite?: number;
  }) {
    exigirAdmin(entrada.ator);
    const filtro: FiltroDoacoes = {
      ...(entrada.status ? { status: entrada.status } : {}),
      ...(entrada.de ? { de: entrada.de } : {}),
      ...(entrada.ate ? { ate: entrada.ate } : {}),
    };
    return listarPagina(this.deps, filtro, entrada.cursor, entrada.limite);
  }
}

export class AdminObterDoacao {
  constructor(private readonly deps: DepsDoacoes) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<DoacaoAdminSaida> {
    exigirAdmin(entrada.ator);
    return doacaoAdminSaida(
      await exigirDoacao(this.deps.doacoes, entrada.id),
      this.deps.armazenamento,
    );
  }
}

export class AprovarDoacao {
  constructor(private readonly deps: DepsDoacoes) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<DoacaoAdminSaida> {
    exigirAdmin(entrada.ator);
    const d = await exigirDoacao(this.deps.doacoes, entrada.id);
    exigirParaAprovar(d.status);
    await this.deps.doacoes.aprovar(d, {
      em: this.deps.relogio.agora(),
      notificacao: NOTIFICACOES_DOACAO.aprovada(d.nomeAnimal),
      auditoria: { adminId: entrada.ator.id, acao: 'DOACAO_ANIMAL_APROVADA' },
    });
    const doador = d.doador;
    if (doador) {
      await enviarSemFalhar(this.deps, () =>
        this.deps.emails.doacaoAprovada({
          para: doador.email,
          nome: doador.nome,
          animal: d.nomeAnimal,
        }),
      );
    }
    return doacaoAdminSaida(
      await exigirDoacao(this.deps.doacoes, d.publicId),
      this.deps.armazenamento,
    );
  }
}

export class RecusarDoacao {
  constructor(private readonly deps: DepsDoacoes) {}

  async executar(entrada: { ator: Ator; id: string; motivo: string }): Promise<DoacaoAdminSaida> {
    exigirAdmin(entrada.ator);
    const motivo = validarMotivoRecusa(entrada.motivo);
    const d = await exigirDoacao(this.deps.doacoes, entrada.id);
    exigirParaRecusar(d.status);
    await this.deps.doacoes.recusar(d, {
      em: this.deps.relogio.agora(),
      motivo,
      notificacao: NOTIFICACOES_DOACAO.recusada(d.nomeAnimal),
      // O texto do motivo fica na doação, não na auditoria (pode ter dado pessoal).
      auditoria: {
        adminId: entrada.ator.id,
        acao: 'DOACAO_ANIMAL_RECUSADA',
        detalhe: { statusAnterior: d.status },
      },
    });
    const doador = d.doador;
    if (doador) {
      await enviarSemFalhar(this.deps, () =>
        this.deps.emails.doacaoRecusada({
          para: doador.email,
          nome: doador.nome,
          animal: d.nomeAnimal,
          motivo,
        }),
      );
    }
    return doacaoAdminSaida(
      await exigirDoacao(this.deps.doacoes, d.publicId),
      this.deps.armazenamento,
    );
  }
}

/**
 * APROVADA → RECEBIDA e cria o Animal EM_TRATAMENTO com cópias das fotos.
 * Idempotente: chamar de novo (toque duplo, duas admins) devolve o mesmo
 * resultado sem criar outro animal.
 */
export class ReceberDoacao {
  constructor(private readonly deps: DepsDoacoes) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<DoacaoAdminSaida> {
    exigirAdmin(entrada.ator);
    const d = await exigirDoacao(this.deps.doacoes, entrada.id);
    if (jaRecebida(d.status)) return doacaoAdminSaida(d, this.deps.armazenamento);

    const animal = validarDadosAnimal(paraDadosAnimal(d));
    const gerarId = this.deps.gerarId ?? randomUUID;
    const animalPublicId = gerarId();
    // Cópias, não as mesmas chaves: apagar uma foto do animal depois não apaga a da doação.
    const copias = d.fotos.map((f) => ({
      origem: f.chave,
      destino: `animais/${animalPublicId}/${gerarId()}.webp`,
    }));
    const destinos = copias.map((c) => c.destino);

    try {
      for (const c of copias) await this.deps.armazenamento.copiar(c.origem, c.destino);
      await this.deps.doacoes.receber(d, {
        em: this.deps.relogio.agora(),
        animalPublicId,
        animal,
        chavesFotosAnimal: destinos,
        notificacao: NOTIFICACOES_DOACAO.recebida(d.nomeAnimal),
        auditoria: {
          adminId: entrada.ator.id,
          acao: 'DOACAO_ANIMAL_RECEBIDA',
          detalhe: { animalId: animalPublicId },
        },
      });
    } catch (erro) {
      await removerSemFalhar(this.deps.armazenamento, destinos);
      // Outra pessoa recebeu ao mesmo tempo: devolve o resultado dela (idempotência).
      if (erro instanceof ErroDominio && erro.codigo === 'DOACAO_ALTERADA') {
        const atual = await exigirDoacao(this.deps.doacoes, d.publicId);
        if (atual.status === 'RECEBIDA') return doacaoAdminSaida(atual, this.deps.armazenamento);
      }
      throw erro;
    }

    const doador = d.doador;
    if (doador) {
      await enviarSemFalhar(this.deps, () =>
        this.deps.emails.doacaoConcluida({
          para: doador.email,
          nome: doador.nome,
          animal: d.nomeAnimal,
        }),
      );
    }
    return doacaoAdminSaida(
      await exigirDoacao(this.deps.doacoes, d.publicId),
      this.deps.armazenamento,
    );
  }
}
