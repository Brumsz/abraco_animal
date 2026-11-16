/** Painel administrativo: dashboard, gestão de usuários e consulta à auditoria. */
import type { Role } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { Dinheiro } from '../../../shared/dominio/dinheiro.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';
import { inicioMesSP, ultimosMeses } from './meses.js';

// ── Portas ───────────────────────────────────────────────────────────────

export type TipoPendencia = 'ADOCAO' | 'DOACAO_ANIMAL' | 'CANDIDATURA_VOLUNTARIO';

export interface Pendencia {
  readonly tipo: TipoPendencia;
  /** publicId do item (o app abre a tela certa pelo tipo). */
  readonly id: string;
  readonly titulo: string;
  readonly criadoEm: Date;
}

export interface RepositorioPainel {
  contar(periodoMes: { inicio: Date; fim: Date }): Promise<{
    adocoesPendentes: number;
    doacoesAnimaisPendentes: number;
    animaisDisponiveis: number;
    doacoesMes: { quantidade: number; totalCentavos: number };
  }>;
  /** Adoções APROVADAS desde `desde`, agrupadas por mês de São Paulo ("AAAA-MM"). */
  adocoesAprovadasPorMes(desde: Date): Promise<{ mes: string; total: number }[]>;
  /** As pendências mais recentes de cada tipo (o caso de uso intercala e corta). */
  pendenciasRecentes(limite: number): Promise<Pendencia[]>;
}

export interface UsuarioAdminRegistro {
  readonly id: number;
  readonly publicId: string;
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly role: Role;
  readonly ativo: boolean;
  readonly cidade: string;
  readonly uf: string;
  readonly criadoEm: Date;
}

export interface CursorPainel {
  readonly criadoEm: Date;
  readonly publicId: string;
}

export interface RepositorioUsuariosAdmin {
  /** Contas removidas (LGPD) não aparecem. */
  listar(
    filtro: { role?: Role; q?: string },
    cursor: CursorPainel | undefined,
    limite: number,
  ): Promise<UsuarioAdminRegistro[]>;
  buscar(publicId: string): Promise<UsuarioAdminRegistro | null>;
  alterarAtivo(u: UsuarioAdminRegistro, ativo: boolean, a: EntradaAuditoria): Promise<void>;
  alterarRole(
    u: UsuarioAdminRegistro,
    role: 'USUARIO' | 'VOLUNTARIO',
    a: EntradaAuditoria,
  ): Promise<void>;
}

/** Derruba todas as sessões (refresh + access tokens ainda válidos). */
export interface EncerradorSessoes {
  encerrarTodas(usuarioId: number): Promise<void>;
}

export interface AuditoriaRegistro {
  readonly publicId: string;
  readonly admin: { readonly publicId: string; readonly nome: string };
  readonly acao: string;
  readonly entidade: string;
  readonly entidadeId: string;
  readonly detalhe: unknown;
  readonly criadoEm: Date;
}

export interface FiltroAuditoria {
  readonly adminId?: string;
  readonly entidade?: string;
  readonly acao?: string;
  readonly de?: Date;
  readonly ate?: Date;
}

export interface RepositorioAuditoria {
  listar(
    filtro: FiltroAuditoria,
    cursor: CursorPainel | undefined,
    limite: number,
  ): Promise<AuditoriaRegistro[]>;
}

interface Deps {
  readonly painel: RepositorioPainel;
  readonly usuarios: RepositorioUsuariosAdmin;
  readonly sessoes: EncerradorSessoes;
  readonly auditoria: RepositorioAuditoria;
  readonly relogio: Relogio;
}

const pagina = <T, R extends { criadoEm: Date; publicId: string }>(
  registros: R[],
  n: number,
  mapear: (r: R) => T,
) => {
  const itens = registros.slice(0, n);
  const ultimo = itens.at(-1);
  return {
    itens: itens.map(mapear),
    proximoCursor:
      registros.length > n && ultimo
        ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
        : null,
  };
};

const limitar = (n: number | undefined) => Math.min(Math.max(Math.trunc(n ?? 20), 1), 50);

// ── Dashboard ────────────────────────────────────────────────────────────

export class ObterDashboard {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator }) {
    exigirAdmin(entrada.ator);
    const agora = this.deps.relogio.agora();
    const meses = ultimosMeses(agora, 6);
    const [contagens, porMes, pendencias] = await Promise.all([
      this.deps.painel.contar({ inicio: inicioMesSP(agora), fim: inicioMesSP(agora, 1) }),
      this.deps.painel.adocoesAprovadasPorMes(inicioMesSP(agora, -5)),
      this.deps.painel.pendenciasRecentes(5),
    ]);
    const totais = new Map(porMes.map((m) => [m.mes, m.total]));
    return {
      adocoesPendentes: contagens.adocoesPendentes,
      doacoesAnimaisPendentes: contagens.doacoesAnimaisPendentes,
      animaisDisponiveis: contagens.animaisDisponiveis,
      doacoesFinanceirasMes: {
        quantidade: contagens.doacoesMes.quantidade,
        total: Dinheiro.deCentavos(contagens.doacoesMes.totalCentavos).paraTexto(),
      },
      // Meses sem adoção aparecem com 0 (o gráfico sempre tem 6 barras).
      adocoesPorMes: meses.map((mes) => ({ mes, total: totais.get(mes) ?? 0 })),
      ultimasPendencias: pendencias
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, 5),
    };
  }
}

// ── Usuários ─────────────────────────────────────────────────────────────

const usuarioSaida = (u: UsuarioAdminRegistro) => ({
  id: u.publicId,
  nome: u.nome,
  email: u.email,
  telefone: u.telefone,
  role: u.role,
  ativo: u.ativo,
  cidade: u.cidade,
  uf: u.uf,
  criadoEm: u.criadoEm,
});

const naoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', 'USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado');

/**
 * O admin não mexe na própria conta nem em outro ADMIN pelo app: um admin não
 * consegue trancar outro (nem a si mesmo) para fora. Mudanças em ADMIN são
 * feitas fora do app, como a própria promoção a ADMIN.
 */
function exigirAlvoGerenciavel(ator: Ator, alvo: UsuarioAdminRegistro): void {
  if (alvo.publicId === ator.id) {
    throw new ErroDominio(
      'PROIBIDO',
      'ACAO_NA_PROPRIA_CONTA',
      'Você não pode alterar a sua própria conta por aqui',
    );
  }
  if (alvo.role === 'ADMIN') {
    throw new ErroDominio(
      'PROIBIDO',
      'ALVO_E_ADMIN',
      'Contas de administrador não são alteradas pelo app',
    );
  }
}

export class AdminListarUsuarios {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: {
    ator: Ator;
    role?: Role;
    q?: string;
    cursor?: CursorPainel;
    limite?: number;
  }) {
    exigirAdmin(entrada.ator);
    const n = limitar(entrada.limite);
    const q = entrada.q?.trim();
    const registros = await this.deps.usuarios.listar(
      { ...(entrada.role ? { role: entrada.role } : {}), ...(q ? { q } : {}) },
      entrada.cursor,
      n + 1,
    );
    return pagina(registros, n, usuarioSaida);
  }
}

export class AlterarAtivoUsuario {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: { ator: Ator; id: string; ativo: boolean }): Promise<void> {
    exigirAdmin(entrada.ator);
    const u = await this.deps.usuarios.buscar(entrada.id);
    if (!u) throw naoEncontrado();
    exigirAlvoGerenciavel(entrada.ator, u);
    if (u.ativo === entrada.ativo) return;
    await this.deps.usuarios.alterarAtivo(u, entrada.ativo, {
      adminId: entrada.ator.id,
      acao: entrada.ativo ? 'USUARIO_REATIVADO' : 'USUARIO_DESATIVADO',
    });
    // Desativar vale NA HORA: sessões e access tokens ainda válidos caem.
    if (!entrada.ativo) await this.deps.sessoes.encerrarTodas(u.id);
  }
}

export class AlterarRoleUsuario {
  constructor(private readonly deps: Deps) {}
  async executar(entrada: {
    ator: Ator;
    id: string;
    role: 'USUARIO' | 'VOLUNTARIO';
  }): Promise<void> {
    exigirAdmin(entrada.ator);
    const u = await this.deps.usuarios.buscar(entrada.id);
    if (!u) throw naoEncontrado();
    exigirAlvoGerenciavel(entrada.ator, u);
    if (u.role === entrada.role) return;
    await this.deps.usuarios.alterarRole(u, entrada.role, {
      adminId: entrada.ator.id,
      acao: 'USUARIO_ROLE_ALTERADA',
      detalhe: { de: u.role, para: entrada.role },
    });
    // Rebaixar tira a permissão na hora (o token atual ainda diria VOLUNTARIO por até 15 min).
    if (entrada.role === 'USUARIO') await this.deps.sessoes.encerrarTodas(u.id);
  }
}

// ── Auditoria ────────────────────────────────────────────────────────────

export class ConsultarAuditoria {
  constructor(private readonly deps: Deps) {}
  async executar(
    entrada: { ator: Ator; cursor?: CursorPainel; limite?: number } & FiltroAuditoria,
  ) {
    exigirAdmin(entrada.ator);
    const n = limitar(entrada.limite);
    const filtro: FiltroAuditoria = {
      ...(entrada.adminId ? { adminId: entrada.adminId } : {}),
      ...(entrada.entidade ? { entidade: entrada.entidade } : {}),
      ...(entrada.acao ? { acao: entrada.acao } : {}),
      ...(entrada.de ? { de: entrada.de } : {}),
      ...(entrada.ate ? { ate: entrada.ate } : {}),
    };
    const registros = await this.deps.auditoria.listar(filtro, entrada.cursor, n + 1);
    return pagina(registros, n, (r) => ({
      id: r.publicId,
      admin: { id: r.admin.publicId, nome: r.admin.nome },
      acao: r.acao,
      entidade: r.entidade,
      entidadeId: r.entidadeId,
      detalhe: r.detalhe,
      criadoEm: r.criadoEm,
    }));
  }
}
