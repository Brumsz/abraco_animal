import type { StatusVoluntario } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { EmailsVoluntariado } from '../../../shared/aplicacao/emails-voluntariado.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';
import { validarMotivoRecusa } from '../../adocoes/domain/adocao.js';
import {
  exigirCandidaturaPendente,
  exigirPodeCandidatar,
  validarCandidatura,
  validarCargo,
  type DadosCandidatura,
  type EntradaCandidatura,
} from '../domain/candidatura.js';

// ── Portas ───────────────────────────────────────────────────────────────

export interface Candidato {
  readonly publicId: string;
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly cidade: string;
  readonly uf: string;
}

export interface CandidaturaRegistro extends DadosCandidatura {
  readonly id: number;
  readonly publicId: string;
  readonly status: StatusVoluntario;
  readonly cargo: string | null;
  readonly motivoRecusa: string | null;
  readonly analisadoEm: Date | null;
  readonly criadoEm: Date;
  readonly candidato: Candidato;
}

export interface CursorCandidaturas {
  readonly criadoEm: Date;
  readonly publicId: string;
}

interface Analise {
  readonly em: Date;
  readonly auditoria: EntradaAuditoria;
  readonly notificacao: ConteudoNotificacao;
}

export interface RepositorioCandidaturas {
  buscarDoUsuario(usuarioId: string): Promise<CandidaturaRegistro | null>;
  buscar(publicId: string): Promise<CandidaturaRegistro | null>;
  /**
   * Cria a candidatura, ou reabre uma RECUSADA do mesmo usuário (um registro
   * por usuário). Corrida → CONFLITO `CANDIDATURA_EM_ANALISE`.
   */
  salvar(usuarioId: string, dados: DadosCandidatura): Promise<CandidaturaRegistro>;
  listar(
    filtro: { status?: StatusVoluntario },
    cursor: CursorCandidaturas | undefined,
    limite: number,
  ): Promise<CandidaturaRegistro[]>;
  /** Numa transação: APROVADO + usuário USUARIO → VOLUNTARIO + notificação + auditoria. */
  aprovar(c: CandidaturaRegistro, d: Analise & { cargo: string | null }): Promise<void>;
  recusar(c: CandidaturaRegistro, d: Analise & { motivo: string }): Promise<void>;
}

interface Deps {
  readonly candidaturas: RepositorioCandidaturas;
  readonly emails: EmailsVoluntariado;
  readonly relogio: Relogio;
  readonly aoFalharEmail?: (erro: unknown) => void;
}

// ── Saídas ───────────────────────────────────────────────────────────────

const saida = (c: CandidaturaRegistro) => ({
  id: c.publicId,
  status: c.status,
  areasInteresse: c.areasInteresse,
  areaInteresseOutros: c.areaInteresseOutros,
  disponibilidadeDias: c.disponibilidadeDias,
  turnos: c.turnos,
  motivacao: c.motivacao,
  habilidades: c.habilidades,
  cargo: c.cargo,
  motivoRecusa: c.motivoRecusa,
  analisadoEm: c.analisadoEm,
  criadoEm: c.criadoEm,
});

export type CandidaturaSaida = ReturnType<typeof saida>;

const saidaAdmin = (c: CandidaturaRegistro) => ({
  ...saida(c),
  candidato: {
    id: c.candidato.publicId,
    nome: c.candidato.nome,
    email: c.candidato.email,
    telefone: c.candidato.telefone,
    cidade: c.candidato.cidade,
    uf: c.candidato.uf,
  },
});

export type CandidaturaAdminSaida = ReturnType<typeof saidaAdmin>;

/** Sem o motivo da recusa: pode aparecer na tela bloqueada. */
export const NOTIFICACOES_VOLUNTARIADO = {
  aprovada: (): ConteudoNotificacao => ({
    tipo: 'VOLUNTARIADO_ATUALIZADO',
    titulo: 'Bem-vindo(a) à equipe! 💛',
    corpo: 'Sua candidatura de voluntariado foi aprovada. Em breve entraremos em contato.',
  }),
  recusada: (): ConteudoNotificacao => ({
    tipo: 'VOLUNTARIADO_ATUALIZADO',
    titulo: 'Sua candidatura foi analisada',
    corpo: 'Toque para ver os detalhes da sua candidatura de voluntariado.',
  }),
} as const;

const naoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', 'CANDIDATURA_NAO_ENCONTRADA', 'Candidatura não encontrada');

async function semFalhar(deps: Deps, envio: () => Promise<void>) {
  try {
    await envio();
  } catch (erro) {
    deps.aoFalharEmail?.(erro);
  }
}

async function exigir(deps: Deps, id: string) {
  const c = await deps.candidaturas.buscar(id);
  if (!c) throw naoEncontrada();
  return c;
}

// ── Candidato ────────────────────────────────────────────────────────────

export class Candidatar {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; dados: EntradaCandidatura }): Promise<CandidaturaSaida> {
    const dados = validarCandidatura(entrada.dados);
    const atual = await this.deps.candidaturas.buscarDoUsuario(entrada.ator.id);
    exigirPodeCandidatar(entrada.ator.role, atual?.status ?? null);
    const c = await this.deps.candidaturas.salvar(entrada.ator.id, dados);
    await semFalhar(this.deps, () =>
      this.deps.emails.candidaturaRecebida({ para: c.candidato.email, nome: c.candidato.nome }),
    );
    return saida(c);
  }
}

export class ObterMinhaCandidatura {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator }): Promise<CandidaturaSaida> {
    const c = await this.deps.candidaturas.buscarDoUsuario(entrada.ator.id);
    if (!c) throw naoEncontrada();
    return saida(c);
  }
}

// ── Admin ────────────────────────────────────────────────────────────────

export const LIMITE_PAGINA_CANDIDATURAS = { padrao: 20, maximo: 50 } as const;

export class AdminListarCandidaturas {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    status?: StatusVoluntario;
    cursor?: CursorCandidaturas;
    limite?: number;
  }) {
    exigirAdmin(entrada.ator);
    const n = Math.min(
      Math.max(Math.trunc(entrada.limite ?? LIMITE_PAGINA_CANDIDATURAS.padrao), 1),
      LIMITE_PAGINA_CANDIDATURAS.maximo,
    );
    const registros = await this.deps.candidaturas.listar(
      entrada.status ? { status: entrada.status } : {},
      entrada.cursor,
      n + 1,
    );
    const itens = registros.slice(0, n);
    const ultimo = itens.at(-1);
    return {
      itens: itens.map(saidaAdmin),
      proximoCursor:
        registros.length > n && ultimo
          ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
          : null,
    };
  }
}

export class AdminObterCandidatura {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<CandidaturaAdminSaida> {
    exigirAdmin(entrada.ator);
    return saidaAdmin(await exigir(this.deps, entrada.id));
  }
}

export class AprovarCandidatura {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    id: string;
    cargo?: string | null;
  }): Promise<CandidaturaAdminSaida> {
    exigirAdmin(entrada.ator);
    const cargo = validarCargo(entrada.cargo);
    const c = await exigir(this.deps, entrada.id);
    exigirCandidaturaPendente(c.status);
    await this.deps.candidaturas.aprovar(c, {
      em: this.deps.relogio.agora(),
      cargo,
      notificacao: NOTIFICACOES_VOLUNTARIADO.aprovada(),
      auditoria: {
        adminId: entrada.ator.id,
        acao: 'VOLUNTARIO_APROVADO',
        detalhe: { usuarioId: c.candidato.publicId, cargo },
      },
    });
    await semFalhar(this.deps, () =>
      this.deps.emails.voluntarioAprovado({
        para: c.candidato.email,
        nome: c.candidato.nome,
        cargo,
      }),
    );
    return saidaAdmin(await exigir(this.deps, c.publicId));
  }
}

export class RecusarCandidatura {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    id: string;
    motivo: string;
  }): Promise<CandidaturaAdminSaida> {
    exigirAdmin(entrada.ator);
    const motivo = validarMotivoRecusa(entrada.motivo);
    const c = await exigir(this.deps, entrada.id);
    exigirCandidaturaPendente(c.status);
    await this.deps.candidaturas.recusar(c, {
      em: this.deps.relogio.agora(),
      motivo,
      notificacao: NOTIFICACOES_VOLUNTARIADO.recusada(),
      auditoria: {
        adminId: entrada.ator.id,
        acao: 'VOLUNTARIO_RECUSADO',
        detalhe: { usuarioId: c.candidato.publicId },
      },
    });
    await semFalhar(this.deps, () =>
      this.deps.emails.voluntarioRecusado({
        para: c.candidato.email,
        nome: c.candidato.nome,
        motivo,
      }),
    );
    return saidaAdmin(await exigir(this.deps, c.publicId));
  }
}
